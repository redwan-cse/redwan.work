import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {runInNewContext} from 'node:vm';

const require = createRequire(import.meta.url);
const workflow = readFileSync(process.env.AUDIT_WORKFLOW || new URL('../../.github/workflows/integrated-foundation-smoke.yml', import.meta.url), 'utf8');
const source = workflow.match(/          # dependency-audit-report:start\n          node <<'NODE'\n([\s\S]*?)          NODE\n          # dependency-audit-report:end/)?.[1].replace(/^          /gm, '');
const clean = () => ({auditReportVersion:2,vulnerabilities:{},metadata:{vulnerabilities:{info:0,low:0,moderate:0,high:0,critical:0,total:0}}});
function vulnerable() {
  const report=clean();
  report.metadata.vulnerabilities.low=report.metadata.vulnerabilities.total=1;
  report.vulnerabilities['example-package']={
    name:'example-package',severity:'low',isDirect:false,range:'<1.0.1',
    nodes:['node_modules/example-package'],effects:['parent-package'],
    via:[{source:12345,url:'https://github.com/advisories/GHSA-2345-6789-cfgh',title:'PRIVATE_TITLE'}],
    fixAvailable:{name:'example-package',version:'1.0.1',isSemVerMajor:false},
  };
  return report;
}
function execute(report, changes={}) {
  assert.ok(source,'bounded audit diagnostic source missing');
  const calls=[], messages=[], stopped={};
  const result={status:0,stdout:JSON.stringify(report),stderr:'',...changes};
  let exit;
  try {
    runInNewContext(source,{
      require(name) {
        if(name==='node:child_process') return {spawnSync(...args){calls.push(args);return result;}};
        if(name==='node:fs') return {readFileSync(path,encoding){
          assert.equal(path,'package-lock.json');assert.equal(encoding,'utf8');
          return JSON.stringify({packages:{'node_modules/example-package':{version:'1.0.0'}}});
        }};
        throw new Error('Unexpected dependency');
      },
      console:{log(message){messages.push(message);}},
      process:{exit(code){exit=code;throw stopped;}},
    },{timeout:1000});
  } catch(error) {if(error!==stopped) throw error;}
  return {calls:JSON.parse(JSON.stringify(calls)),messages,output:messages.join('\n'),exit};
}
test('audit workflow retains read-only permissions exact runtime and no suppression',()=>{
  assert.ok(source);assert.match(workflow,/permissions:\n  contents: read/);
  assert.match(workflow,/node-version: '22\.23\.1'/);
  assert.doesNotMatch(workflow,/continue-on-error|audit fix|--omit|--production/);
});
test('zero findings require the full low threshold audit',()=>{
  const run=execute(clean());assert.equal(run.exit,0);
  assert.deepEqual(run.calls[0].slice(0,2),['npm',['audit','--json','--audit-level=low']]);
  assert.equal(run.calls[0][2].timeout,120000);assert.equal(run.calls[0][2].shell,undefined);
  assert.match(run.output,/total=0/);
});
test('low findings fail and expose only public actionable metadata',()=>{
  const run=execute(vulnerable(),{status:1});assert.equal(run.exit,1);
  for(const text of ['example-package','severity=low','installed=1.0.0','<1.0.1','GHSA-2345-6789-cfgh','example-package@1.0.1','parent-package']) assert.ok(run.output.includes(text));
  assert.doesNotMatch(run.output,/PRIVATE_TITLE/);
});
test('findings fail despite zero exit and nonzero exits are preserved',()=>{
  assert.equal(execute(vulnerable()).exit,1);assert.equal(execute(clean(),{status:17}).exit,17);
});
test('invalid output and registry errors fail without raw diagnostics',()=>{
  const invalid=execute(null,{stdout:'PRIVATE_TOKEN',stderr:'SECRET_URL',status:1});
  assert.equal(invalid.exit,1);assert.match(invalid.output,/invalid-report/);assert.doesNotMatch(invalid.output,/PRIVATE_TOKEN|SECRET_URL/);
  const registry=execute({error:{code:'ENOTFOUND',summary:'PRIVATE_HOST',detail:'SECRET_TOKEN'}},{status:1});
  assert.equal(registry.exit,1);assert.match(registry.output,/ENOTFOUND/);assert.doesNotMatch(registry.output,/PRIVATE_HOST|SECRET_TOKEN/);
});
test('timeouts and invalid metadata cannot become a clean audit',()=>{
  const run=execute(clean(),{status:null,signal:'SIGTERM',error:{code:'ETIMEDOUT',message:'PRIVATE_PATH'}});
  assert.equal(run.exit,1);assert.match(run.output,/execution-failed/);assert.doesNotMatch(run.output,/PRIVATE_PATH/);
  assert.equal(execute({auditReportVersion:2,vulnerabilities:{}}).exit,1);
  const report=vulnerable();report.metadata.vulnerabilities.total=0;assert.equal(execute(report).exit,1);
});
test('malicious package metadata cannot inject commands or secrets',()=>{
  const report=vulnerable(), item=report.vulnerabilities['example-package'];
  item.name='bad\n::notice::SECRET';item.range='https://private.test/?token=SECRET';
  item.effects=['bad\n::notice::SECRET'];item.via[0].url='https://private.test/SECRET';
  item.fixAvailable={name:'bad\nSECRET',version:'TOKEN_SECRET'};
  const run=execute(report,{status:1});assert.equal(run.exit,1);assert.doesNotMatch(run.output,/SECRET|private\.test|::notice::/);
});
test('large reports stay bounded without hiding failure',()=>{
  const report=clean();report.metadata.vulnerabilities.low=report.metadata.vulnerabilities.total=60;
  for(let n=0;n<60;n++) report.vulnerabilities[`package-${n}`]={...vulnerable().vulnerabilities['example-package'],name:`package-${n}`};
  const run=execute(report,{status:1});assert.equal(run.exit,1);assert.ok(run.messages.length<=42);
  assert.match(run.output,/total=60/);assert.match(run.output,/omitted=20/);
});
test('info-only findings retain the low threshold',()=>{
  const report=vulnerable();report.vulnerabilities['example-package'].severity='info';
  report.metadata.vulnerabilities.info=1;report.metadata.vulnerabilities.low=0;assert.equal(execute(report).exit,0);
});
function floor(manifest,lock) {
  const atLeast=(value,min,label)=>{
    assert.match(value,/^\d+\.\d+\.\d+$/);
    const parts=value.split('.').map(Number);assert.equal(parts[0],min[0],`${label}: unreviewed major`);
    const index=parts.findIndex((part,i)=>part!==min[i]);
    assert.ok(index===-1||parts[index]>min[index],`${label}: vulnerable version`);
  };
  assert.equal(lock.lockfileVersion,3);
  const next=lock.packages['node_modules/next'];atLeast(next.version,[16,3,6],'next');
  assert.equal(manifest.dependencies.next,next.version);
  assert.equal(lock.packages[''].dependencies.next,next.version);
  assert.equal(next.dependencies['@next/env'],next.version);
  assert.equal(lock.packages['node_modules/@next/env'].version,next.version);
  for(const [name,version] of Object.entries(next.optionalDependencies)) if(name.startsWith('@next/swc-')){
    assert.equal(version,next.version);assert.equal(lock.packages[`node_modules/${name}`]?.version,next.version);
  }
  const minima={1:[1,1,21],2:[2,1,7],3:[3,0,9],5:[5,0,12]};
  let copies=0;
  for(const [path,item] of Object.entries(lock.packages)) if(/(?:^|\/)node_modules\/brace-expansion$/.test(path)){
    copies++;const min=minima[item.version.split('.')[0]];assert.ok(min,'unreviewed major');atLeast(item.version,min,'brace-expansion');
  }
  assert.ok(copies>0);
}
function fixture() {
  const manifest={dependencies:{next:'16.3.6'}};
  const packages={
    '':{dependencies:{next:'16.3.6'}},
    'node_modules/next':{version:'16.3.6',dependencies:{'@next/env':'16.3.6'},optionalDependencies:{}},
    'node_modules/@next/env':{version:'16.3.6'},
  };
  for(const platform of ['darwin-x64','darwin-arm64','linux-x64-gnu','linux-x64-musl','win32-x64-msvc','linux-arm64-gnu','linux-arm64-musl','win32-arm64-msvc']){
    const name=`@next/swc-${platform}`;
    packages['node_modules/next'].optionalDependencies[name]='16.3.6';
    packages[`node_modules/${name}`]={version:'16.3.6'};
  }
  for(const [i,version] of ['1.1.21','2.1.7','5.0.12'].entries()) packages[`node_modules/parent-${i}/node_modules/brace-expansion`]={version};
  return [manifest,{lockfileVersion:3,packages}];
}
test('committed manifest and complete lockfile retain security floors',()=>{
  floor(JSON.parse(readFileSync(process.env.SECURITY_MANIFEST||new URL('../../package.json',import.meta.url))),JSON.parse(readFileSync(process.env.SECURITY_LOCK||new URL('../../package-lock.json',import.meta.url))));
});
test('floor regressions accept reviewed versions and reject old Next and compiler drift',()=>{
  floor(...fixture());
  const old=fixture();old[0].dependencies.next='^16.0.7';old[1].packages['node_modules/next'].version='16.3.4';assert.throws(()=>floor(...old));
  const compiler=fixture();compiler[1].packages['node_modules/@next/swc-linux-x64-gnu'].version='16.3.4';assert.throws(()=>floor(...compiler));
});
for(const [i,version] of ['1.1.18','2.1.4','5.0.9','4.0.1'].entries()) test(`floor rejects brace-expansion ${version}`,()=>{
  const data=fixture();data[1].packages[`node_modules/parent-${i%3}/node_modules/brace-expansion`].version=version;assert.throws(()=>floor(...data));
});
test('consumed dependency publisher has no executable job or credential binding',()=>{
  const retired=readFileSync(new URL('../../.github/workflows/dependency-security-repair.yml',import.meta.url),'utf8');
  assert.match(retired,/if: \$\{\{ false \}\}/);assert.match(retired,/contents: read/);
  assert.doesNotMatch(retired,/contents: write|github\.token|secrets\.|REPAIR_PROGRAM|REPAIR_TOKEN/);
});

// GHSA-vfj7-8cjw-p6xm: the alias alone is not remediation evidence.
const guardName='@dieub/braces-depth-guard', guardVersion='3.0.3-pn.1';
const integrity='sha512-Y45K9cPXRCVrbXMenyNgKrzd+rl4jyto+BvvzVkVSsxHZ0ETQsYArTX/ZQjjCEpEmZsTzjUzHcHR6ygRtDjxQg==';
function guard(manifest,lock) {
  assert.equal(manifest.overrides.braces,`npm:${guardName}@${guardVersion}`,'exact reviewed braces override required');
  const copies=Object.entries(lock.packages).filter(([path])=>/(?:^|\/)node_modules\/braces$/.test(path));assert.ok(copies.length>0);
  for(const [,item] of copies){
    assert.equal(item.name,guardName);assert.equal(item.version,guardVersion);assert.equal(item.integrity,integrity);
    assert.equal(item.resolved,`https://registry.npmjs.org/${guardName}/-/braces-depth-guard-${guardVersion}.tgz`);
    assert.deepEqual(item.dependencies,{'fill-range':'^7.1.1'});assert.ok(!item.hasInstallScript);
  }
  return copies;
}
test('braces identity and installed bytes match reviewed source',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url)));
  const lock=JSON.parse(readFileSync(new URL('../../package-lock.json',import.meta.url)));
  const hashes={
    'index.js':'d222c13b579d2d476dc26d692219dbaee1665b88',
    'lib/compile.js':'945a78b584b778ef1871261609b540bc4005b5c2',
    'lib/constants.js':'c23709951666ff6bb0d726084d89e62948446bd7',
    'lib/expand.js':'80ea368a552f84e2fe4f38b87073d2bb0b174c7d',
    'lib/parse.js':'6a1adb7dfeeb35bf43752511a731e1b74ffc7b09',
    'lib/stringify.js':'fcdee6617914428be1c1f1a86595f72f148c7510',
    'lib/utils.js':'d19311fe044ad5157624077670dc297e8b53da49',
    'LICENSE':'9af4a67d206f24ecdbb5fdff2839041ca0bbd346',
  };
  for(const [path] of guard(manifest,lock)){
    const pkg=JSON.parse(readFileSync(new URL(`../../${path}/package.json`,import.meta.url)));
    assert.equal(pkg.name,guardName);assert.equal(pkg.version,guardVersion);assert.deepEqual(pkg.dependencies,{'fill-range':'^7.1.1'});
    assert.deepEqual(pkg.scripts,{test:'mocha test --reporter dot'});
    for(const [file,hash] of Object.entries(hashes)){
      const bytes=readFileSync(new URL(`../../${path}/${file}`,import.meta.url));
      assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),hash,`${path}/${file}: changed bytes`);
    }
  }
});
test('braces gate rejects altered integrity and nested vulnerable copies',()=>{
  const item={name:guardName,version:guardVersion,integrity,resolved:`https://registry.npmjs.org/${guardName}/-/braces-depth-guard-${guardVersion}.tgz`,dependencies:{'fill-range':'^7.1.1'}};
  const manifest={overrides:{braces:`npm:${guardName}@${guardVersion}`}}, lock={packages:{'node_modules/braces':item}};
  guard(manifest,lock);
  assert.throws(()=>guard(manifest,{packages:{'node_modules/braces':{...item,integrity:'changed'}}}));
  assert.throws(()=>guard(manifest,{packages:{...lock.packages,'node_modules/other/node_modules/braces':{version:'3.0.3'}}}));
});
test('braces rejects excessive string and direct AST depth',()=>{
  const braces=require('braces');
  for(const depth of [101,1000,4998]){
    const input='{'.repeat(depth)+'a'+'}'.repeat(depth);
    for(const method of ['parse','compile','expand','stringify']) assert.throws(()=>braces[method](input),/exceeds max depth/,`${method} must reject depth ${depth}`);
  }
  for(const method of ['compile','expand','stringify']){
    let ast={type:'text',value:'a'};
    for(let n=0;n<1000;n++) ast={type:'brace',nodes:[ast]};
    assert.throws(()=>braces[method]({type:'root',nodes:[ast]}),/exceeds max depth/);
  }
  assert.throws(()=>braces.parse('('.repeat(101)+')'.repeat(101)),/exceeds max depth/);
  assert.doesNotThrow(()=>braces.compile('{'.repeat(100)+'a'+'}'.repeat(100)));
  assert.throws(()=>braces.parse('{{a,b},c}',{maxDepth:1}),/exceeds max depth/);
  assert.doesNotThrow(()=>braces.parse('{{a,b},c}',{maxDepth:2}));
  for(const maxDepth of [10000,Infinity,NaN]) assert.throws(()=>braces.parse('{'.repeat(101)+'a'+'}'.repeat(101),{maxDepth}),/exceeds max depth/);
});
test('braces preserves ranges escaping glob and watch consumers',async()=>{
  const braces=require('braces');
  assert.deepEqual(braces.expand('x{1..3}'),['x1','x2','x3']);assert.deepEqual(braces.expand('{c..a}'),['c','b','a']);
  assert.deepEqual(braces.expand('a/{b,c}/d'),['a/b/d','a/c/d']);
  for(const input of ['{{a}}','{a,{b}}','{{x}y}','{a,{b,{c}}}','{}{a}','{1..8}']) assert.equal(braces.stringify(input,{escapeInvalid:true}),input);
  assert.deepEqual(braces.expand('a\\{b,c}'),['a{b,c}']);
  for(const consumer of ['micromatch','chokidar']) assert.equal(createRequire(require.resolve(consumer))('braces/package.json').name,guardName);
  const micromatch=require('micromatch'),glob=require('fast-glob');
  assert.deepEqual(micromatch(['src/a.ts','src/b.tsx','src/a.css'],'src/*.{ts,tsx}'),['src/a.ts','src/b.tsx']);
  assert.throws(()=>micromatch.braces('{'.repeat(101)+'a'+'}'.repeat(101)),/exceeds max depth/);
  const root=mkdtempSync(join(tmpdir(),'braces-compat-'));let watcher;
  try {
    mkdirSync(join(root,'src'));
    for(const file of ['a.ts','b.tsx','c.css']) writeFileSync(join(root,'src',file),'');
    assert.deepEqual(glob.sync('src/*.{ts,tsx}',{cwd:root}).sort(),['src/a.ts','src/b.tsx']);
    watcher=require('chokidar').watch('src/*.{ts,tsx}',{cwd:root,ignoreInitial:false});
    const seen=[];
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('watch fixture timeout')),5000);
      watcher.on('add',path=>seen.push(path));
      watcher.once('error',error=>{clearTimeout(timer);reject(error);});
      watcher.once('ready',()=>{clearTimeout(timer);resolve();});
    });
    assert.deepEqual(seen.sort(),['src/a.ts','src/b.tsx']);
  } finally {if(watcher) await watcher.close();rmSync(root,{recursive:true,force:true});}
});

// Official CSS dependency repairs: GHSA-68fv-2mgg-jv7q / GHSA-rj75-hqrm-r3gf.
// Run resource-exhaustion regressions in bounded children, never the test runner.
import {spawnSync} from 'node:child_process';
function cssProbe(fn, marker) {
  const script=`const assert=require('node:assert/strict');try {(${fn.toString()})();process.stdout.write('PASS');}
    catch(error){process.stdout.write(String(error.message).includes(${JSON.stringify(marker)})?${JSON.stringify(marker)}:'ERR_CSS_PROBE_SETUP');process.exitCode=1;}`;
  const result=spawnSync(process.execPath,['--max-old-space-size=192','-e',script],{
    cwd:new URL('../../',import.meta.url),encoding:'utf8',timeout:10000,maxBuffer:16384,
    env:{PATH:process.env.PATH,HOME:process.env.HOME},
  });
  assert.ok(!result.error&&!result.signal,'ERR_CSS_PROBE_EXECUTION');
  assert.equal(result.status,0,result.stdout);
  assert.equal(result.stdout,'PASS');
}
test('CSS security rejects excessive indexed source-map offsets',()=>{
  cssProbe(()=>{
    const {SourceMapConsumer}=require('source-map-js');
    const map={version:3,sources:['fixture.js'],names:[],mappings:'AAAA'};
    const indexed=(line,column=0,child=map)=>({version:3,sections:[{offset:{line,column},map:child}]});
    assert.throws(()=>new SourceMapConsumer(indexed(10000001)),/must not exceed/,'ERR_SOURCE_OFFSET_REJECT');
    for(const value of [-1,1.5,NaN,Infinity,'1',null,Number.MAX_SAFE_INTEGER+1]){
      assert.throws(()=>new SourceMapConsumer(indexed(value)),/non-negative integers/);
      assert.throws(()=>new SourceMapConsumer(indexed(0,value)),/non-negative integers/);
    }
    assert.doesNotThrow(()=>new SourceMapConsumer(indexed(10000000)));
    assert.throws(()=>new SourceMapConsumer(indexed(6000000,0,indexed(6000000))),/including offsets/);
  },'ERR_SOURCE_OFFSET_REJECT');
});
test('CSS security bounds flat-selector membership work',()=>{
  cssProbe(()=>{
    const parser=require('postcss-selector-parser'), original=Array.prototype.indexOf;
    // Count numeric-array search capacity, not wall-clock time; no timing retries.
    for(const atom of ['.a','#a','#{a}']){
      let work=0,tree;const count=1024;
      try {
        Array.prototype.indexOf=function(...args){
          if(this.length&&typeof this[0]==='number') work+=this.length;
          return Reflect.apply(original,this,args);
        };
        tree=parser().astSync(atom.repeat(count));
      } finally {Array.prototype.indexOf=original;}
      assert.ok(work<100*count,'ERR_SELECTOR_QUADRATIC');
      assert.equal(tree.toString(),atom.repeat(count));
      if(atom!=='#{a}') assert.equal(tree.first.nodes.length,count);
    }
  },'ERR_SELECTOR_QUADRATIC');
});
test('CSS source maps preserve mapping and bounded nested-source reads',()=>{
  cssProbe(()=>{
    const {SourceMapConsumer,SourceMapGenerator,SourceNode}=require('source-map-js');
    let map={version:3,sources:['fixture.js'],sourcesContent:['x'],names:[],mappings:'AAAA'};
    for(let n=0;n<8;n++) map={version:3,sections:[{offset:{line:1,column:0},map}]};
    const consumer=new SourceMapConsumer(map);let leaf=consumer;
    for(let n=0;n<8;n++) leaf=leaf._sections[0].consumer;
    let reads=0;const sources=leaf.sources;
    Object.defineProperty(leaf,'sources',{get(){reads++;return sources;}});
    assert.deepEqual(consumer.sources,['fixture.js']);assert.equal(reads,1,'ERR_SOURCE_READ_AMPLIFICATION');
    const generator=new SourceMapGenerator({file:'out.js'});
    generator.addMapping({generated:{line:3,column:0},original:{line:1,column:0},source:'fixture.js'});
    const ordinary=new SourceMapConsumer(generator.toJSON());
    assert.equal(ordinary.originalPositionFor({line:3,column:0}).source,'fixture.js');
    const distant=new SourceMapConsumer({version:3,sections:[{offset:{line:10000,column:0},map:{
      version:3,sources:['fixture.js'],sourcesContent:['x'],names:[],mappings:'AAAA',
    }}]});
    const node=SourceNode.fromStringWithSourceMap('x;\n',distant);
    assert.equal(node.toString(),'x;\n');assert.ok(node.children.length<10);
  },'ERR_SOURCE_READ_AMPLIFICATION');
});
test('CSS installed graph uses exact official patched packages for every consumer',()=>{
  const manifest=require('../../package.json'), lock=require('../../package-lock.json');
  const versions={'source-map-js':'1.2.2','postcss-selector-parser':'7.1.6'};
  for(const [name,version] of Object.entries(versions)){
    assert.equal(manifest.overrides[name],version);
    const copies=Object.entries(lock.packages).filter(([path])=>path.endsWith(`/node_modules/${name}`)||path===`node_modules/${name}`);
    assert.ok(copies.length>0);
    for(const [path,item] of copies){
      assert.equal(item.version,version);assert.equal(item.resolved,`https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`);
      assert.match(item.integrity,/^sha512-[A-Za-z0-9+/]+=*$/);assert.ok(!item.hasInstallScript);
      const installed=require(`../../${path}/package.json`);
      assert.equal(installed.name,name);assert.equal(installed.version,version);
      assert.deepEqual(installed.dependencies||{},item.dependencies||{});
      for(const hook of ['preinstall','install','postinstall']) assert.ok(!installed.scripts?.[hook]);
    }
    let consumers=0;
    for(const [path,item] of Object.entries(lock.packages)){
      if(!path||!item.dependencies?.[name]) continue;
      const from=createRequire(new URL(`../../${path}/package.json`,import.meta.url));
      assert.equal(from(`${name}/package.json`).version,version,`${path}: vulnerable consumer resolution`);
      consumers++;
    }
    assert.ok(consumers>0);
  }
  assert.equal(lock.packages['node_modules/tailwindcss'].version,'3.4.18');
  assert.equal(lock.packages['node_modules/postcss-nested'].version,'6.2.0');
  assert.equal(lock.packages['node_modules/tailwindcss-animate'].version,'1.0.7');
});
test('CSS parser preserves selector mutation escaping and nesting consumers',async()=>{
  const parser=require('postcss-selector-parser'),postcss=require('postcss');
  for(const selector of ['.a.b','#x.y',':is(.a, .b) > [data-state="open"]','.sm\\:hover\\:block:hover','svg|a','&:focus-visible']){
    assert.equal(parser().processSync(selector),selector);
  }
  const unesc=require('postcss-selector-parser/dist/util/unesc');
  assert.equal((unesc.default||unesc)('sm\\:block'),'sm:block');
  const ast=parser().astSync('.a.b'),seen=[];
  ast.walkClasses(node=>{seen.push(node.value);if(node.value==='a')node.parent.insertBefore(node,parser.className({value:'prefix'}));});
  assert.deepEqual(seen,['a','b']);assert.equal(ast.toString(),'.prefix.a.b');
  const result=await postcss([require('postcss-nested')]).process('.a { &:hover { color: red } .b { color: blue } }',{
    from:'fixture.css',to:'fixture.out.css',map:{inline:false},
  });
  assert.match(result.css,/\.a:hover/);assert.match(result.css,/\.a \.b/);
  assert.ok(result.map.toJSON().mappings);
});
