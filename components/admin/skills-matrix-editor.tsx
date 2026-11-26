'use client';

import * as React from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SkillCategoryEntry {
  id: string;
  name: string;
  skills: string[];
}

export function SkillsMatrixEditor({
  initialSkills,
}: {
  initialSkills: Record<string, string[]>;
}) {
  const [categories, setCategories] = React.useState<SkillCategoryEntry[]>(() =>
    Object.entries(initialSkills ?? {}).map(([name, skills], idx) => ({
      id: `cat-${idx}-${name}`,
      name,
      skills: Array.isArray(skills) ? skills : [],
    }))
  );
  const [newCategoryName, setNewCategoryName] = React.useState('');
  const [draftSkillById, setDraftSkillById] = React.useState<Record<string, string>>({});

  const serializedJson = React.useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const cat of categories) {
      const trimmed = cat.name.trim();
      if (trimmed) {
        out[trimmed] = cat.skills;
      }
    }
    return JSON.stringify(out, null, 2);
  }, [categories]);

  const addCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    setCategories((prev) => [
      ...prev,
      { id: `cat-${Date.now()}-${trimmed}`, name: trimmed, skills: [] },
    ]);
    setNewCategoryName('');
  };

  const removeCategory = (id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };

  const addSkill = (id: string) => {
    const raw = (draftSkillById[id] ?? '').trim();
    if (!raw) return;
    const tokens = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id === id
          ? { ...cat, skills: Array.from(new Set([...cat.skills, ...tokens])) }
          : cat
      )
    );
    setDraftSkillById((prev) => ({ ...prev, [id]: '' }));
  };

  const removeSkill = (id: string, skill: string) => {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id === id ? { ...cat, skills: cat.skills.filter((s) => s !== skill) } : cat
      )
    );
  };

  return (
    <div className="space-y-3 rounded-xl border border-border/80 bg-muted/15 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-sm font-semibold">
          Visual Technical Skills Matrix ({categories.length} categories)
        </Label>
        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
          <Input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCategory();
              }
            }}
            placeholder="New category (e.g. Cloud & DevSecOps)"
            aria-label="New technical skill category name"
            className="h-9 min-w-0 flex-1 sm:w-60 sm:flex-initial"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCategory}
            className="h-9 gap-1 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Category
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {categories.map((cat) => (
          <div key={cat.id} className="space-y-2 rounded-lg border border-border/70 bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <Input
                value={cat.name}
                onChange={(e) =>
                  setCategories((prev) =>
                    prev.map((c) => (c.id === cat.id ? { ...c, name: e.target.value } : c))
                  )
                }
                aria-label="Skill category title"
                className="h-9 font-semibold"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeCategory(cat.id)}
                aria-label={`Remove category ${cat.name}`}
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {cat.skills.map((skill) => (
                <Badge key={skill} variant="secondary" className="gap-1 font-mono text-[10px]">
                  <span>{skill}</span>
                  <button
                    type="button"
                    onClick={() => removeSkill(cat.id, skill)}
                    aria-label={`Remove skill ${skill}`}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:text-destructive"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </Badge>
              ))}
              {cat.skills.length === 0 && (
                <span className="text-[11px] text-muted-foreground">No skill tags yet.</span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <Input
                value={draftSkillById[cat.id] ?? ''}
                onChange={(e) =>
                  setDraftSkillById((prev) => ({ ...prev, [cat.id]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSkill(cat.id);
                  }
                }}
                placeholder="Add skill(s), comma-separated..."
                aria-label={`Add skills to ${cat.name}`}
                className="h-9"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addSkill(cat.id)}
                className="h-9 px-3 text-xs"
              >
                Add
              </Button>
            </div>
          </div>
        ))}
      </div>

      <input type="hidden" name="technical_skills_json" value={serializedJson} />

      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer font-mono hover:text-foreground">
          Preview serialized JSON payload
        </summary>
        <pre className="mt-1.5 max-h-40 overflow-auto rounded-lg border border-border/60 bg-background p-2 font-mono text-[10px]">
          {serializedJson}
        </pre>
      </details>
    </div>
  );
}
