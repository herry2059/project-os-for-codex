import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyNextSteps } from '@/lib/api';
import type { Project } from '@/lib/types';
import { Empty } from '@/components/ui';
import { ArrowRight } from 'lucide-react';

export default function MyNextPage() {
  const [items, setItems] = useState<
    Array<{ project: Project; nextStep: string }> | null
  >(null);

  useEffect(() => {
    getMyNextSteps().then(setItems);
  }, []);

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-ink-500 mb-4">
        Start with the first item below. Record the result in the project when it is done, and progress will update automatically.
      </p>

      {!items ? (
        <Empty text="Loading…" />
      ) : items.length === 0 ? (
        <Empty text="Nothing is waiting. Review your projects or create a new one." />
      ) : (
        <div className="space-y-3">
          {items.slice(0, 3).map(({ project, nextStep }, i) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="card p-4 flex items-center gap-4 hover:border-white/20 transition"
            >
              <div className="h-8 w-8 shrink-0 rounded-full bg-white text-black flex items-center justify-center text-sm font-semibold">
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-ink-400 mb-0.5">{project.name}</div>
                <div className="text-ink-900 font-medium truncate">{nextStep}</div>
              </div>
              <ArrowRight className="text-ink-400" size={18} />
            </Link>
          ))}
          {items.length > 3 && (
            <p className="text-xs text-ink-400 text-center pt-2">
              {items.length - 3} more items remain. Finish the first three before continuing.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
