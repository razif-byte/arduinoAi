import { useMemo, useState } from 'react';
import { Code2, Search } from 'lucide-react';
import { ELECTRONIC_COMPONENTS_DB } from '../data/boardsAndComponents';

interface ComponentLibraryViewProps {
  onLoadSampleCode: (code: string, fileName: string) => void;
}

export function ComponentLibraryView({ onLoadSampleCode }: ComponentLibraryViewProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [selectedId, setSelectedId] = useState(ELECTRONIC_COMPONENTS_DB[0].id);

  const categories = ['All', ...Array.from(new Set(ELECTRONIC_COMPONENTS_DB.map((c) => c.category)))];

  const filtered = useMemo(() => {
    return ELECTRONIC_COMPONENTS_DB.filter((c) => {
      const matchCat = category === 'All' || c.category === category;
      const q = query.trim().toLowerCase();
      const matchQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.interfaceType.toLowerCase().includes(q) ||
        c.datasheetSummary.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [query, category]);

  const selected =
    filtered.find((c) => c.id === selectedId) ?? filtered[0] ?? ELECTRONIC_COMPONENTS_DB[0];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Electronic Component Library & Pinout Database
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Verified sensor, actuator, semiconductor, and power module datasheets with ready-to-compile Arduino examples.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sensors, MOSFETs, I2C displays..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                category === cat
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-2">
          {filtered.map((comp) => (
            <button
              key={comp.id}
              type="button"
              onClick={() => setSelectedId(comp.id)}
              className={`w-full text-left p-3.5 rounded-lg border transition-colors ${
                selected.id === comp.id
                  ? 'border-sky-500 bg-sky-500/10'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] hover:border-slate-400'
              }`}
            >
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{comp.name}</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {comp.category} · {comp.voltageRange} · {comp.interfaceType}
              </div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2 p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{selected.name}</h2>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {selected.voltageRange} · {selected.interfaceType}
                {selected.libraryName ? ` · Library: ${selected.libraryName}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                onLoadSampleCode(
                  selected.sampleCode,
                  selected.sampleCode.includes('void main(') ? `${selected.id}_example.c` : `${selected.id}_example.ino`
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-500"
            >
              <Code2 className="w-3.5 h-3.5" />
              Open Sample in IDE
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Datasheet Summary</h3>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{selected.datasheetSummary}</p>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">Pinout Configuration</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-1.5 pr-4">Pin</th>
                    <th className="py-1.5">Electrical Function</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {selected.pins.map((p) => (
                    <tr key={p.name}>
                      <td className="py-1.5 pr-4 font-mono font-semibold text-sky-600 dark:text-sky-400">{p.name}</td>
                      <td className="py-1.5 text-slate-600 dark:text-slate-300">{p.function}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200">
            <span className="font-semibold">Wiring Note: </span>
            {selected.wiringNotes}
          </div>

          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">Reference Sketch</h3>
            <pre className="p-3 rounded-lg bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto">
              {selected.sampleCode}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
