import json, os, pathlib, re, subprocess
report=pathlib.Path(os.environ['RUNNER_TEMP'])/'reliability-result.json'
stages=[('dependencies',['npm','ci']),('tests',['bash','-c','node --experimental-strip-types --test tests/reliability/*.test.mjs tests/invoice-quantity.test.mjs']),('lint',['npm','run','lint']),('typegen',['npx','next','typegen']),('types',['npx','tsc','--noEmit']),('build',['npm','run','build'])]
for name,command in stages:
    result=subprocess.run(command,text=True,capture_output=True)
    output=result.stdout+result.stderr
    if result.returncode:
        matches=re.findall(r'([\w/().\[\]-]+\.tsx?)\((\d+),\d+\): error (TS\d+)',output)
        detail='; '.join(f'{p}:{line} {code}' for p,line,code in matches[:2])
        if name=='tests':
            failures=re.findall(r'^not ok \d+ - (.+)$',output,re.M)
            codes=re.findall(r'\bERR_[A-Z_]+\b',output)
            names=[]
            for value in failures:
                value=value.replace(os.getcwd()+'/','')
                if re.fullmatch(r'[A-Za-z0-9_/(). -]{1,100}',value): names.append(value)
            detail='; '.join(names[:1]+list(dict.fromkeys(codes))[:1]) or 'assertions='+str(len(failures))
        report.write_text(json.dumps({'state':'failure','stage':name,'detail':detail}))
        print('::error::Reliability verification failed at '+name+(' ('+detail+')' if detail else ''))
        raise SystemExit(1)
    print('Passed: '+name)
report.write_text(json.dumps({'state':'success','stage':'all','detail':''}))
