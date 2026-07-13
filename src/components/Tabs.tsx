import { useState, type ReactNode } from 'react';

/**
 * Sticky secondary navigation that splits long pages into horizontal tabs.
 * Usage: <Tabs items={[{ key, label, icon?, node }]} />
 */
export interface TabItem {
  key: string;
  label: string;
  icon?: ReactNode;
  node: ReactNode;
}

export default function Tabs({ items, defaultKey }: { items: TabItem[]; defaultKey?: string }) {
  const [active, setActive] = useState(defaultKey || items[0]?.key);
  const cur = items.find((i) => i.key === active) ?? items[0];

  return (
    <div>
      {/* Sticky horizontal navigation */}
      <div className="tabs-bar sticky top-0 z-20 -mx-4 mb-5 border-b px-4 backdrop-blur-xl md:-mx-7 md:px-7">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {items.map((i) => {
            const on = i.key === cur?.key;
            return (
              <button
                key={i.key}
                onClick={() => setActive(i.key)}
                className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 py-3 text-sm transition ${
                  on ? 'text-white' : 'text-white/45 hover:text-white/80'
                }`}
              >
                {i.icon}
                {i.label}
                {on && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-cyan-400 to-sky-500" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active tab content */}
      <div>{cur?.node}</div>
    </div>
  );
}
