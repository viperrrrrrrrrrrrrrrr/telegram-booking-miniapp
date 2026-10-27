import { ChevronRight, Footprints, Hand, Lock, Sparkles } from 'lucide-react';
import { studio } from '../../shared/config';
import { MyBookings } from './MyBookings';
import { Admin } from './Admin';
import { useBackButton, useMainButton, useTg } from '../telegram/TelegramProvider';
import { useApp, type Tab } from '../state';
import { duration, money } from '../lib/format';

const ICONS: Record<string, typeof Hand> = { hands: Hand, feet: Footprints, extras: Sparkles };

export function Home() {
  const { tab, setTab, me, bookings, adminEnabled, repo } = useApp();
  const { firstName, haptic } = useTg();
  useBackButton(null);
  useMainButton({ text: '', visible: false }, () => {});
  const upcoming = (bookings ?? []).filter((b) => b.status === 'confirmed' && b.end > Date.now()).length;
  const tabs: { id: Tab; label: string }[] = [{ id: 'book', label: 'Book' }, { id: 'bookings', label: 'My bookings' }, ...(adminEnabled ? [{ id: 'studio' as Tab, label: 'Studio' }] : [])];

  return (
    <div>
      <header className="hero relative mb-4 overflow-hidden rounded-3xl px-5 pt-5 pb-4">
        <div aria-hidden="true" className="hero-blob" />
        <p className="relative text-[13px] font-medium text-tg-hint" data-testid="demo-label">{studio.demoLabel}</p>
        <h1 className="relative mt-2 text-[26px] leading-tight font-bold tracking-tight" data-testid="greeting">Hi, {me.firstName && me.firstName !== 'Guest' ? me.firstName : firstName} <span aria-hidden="true">👋</span></h1>
        <p className="relative mt-1 text-[15px] text-tg-subtitle">{studio.fullName} · {studio.tagline}</p>
        <p className="relative mt-3 inline-flex items-center gap-1.5 rounded-full bg-tg-section/80 px-2.5 py-1 text-[12px] font-medium text-tg-hint" data-testid="mode-chip">
          <Lock className="size-3.5" aria-hidden="true" />
          {repo.mode === 'demo' ? 'Demo mode · bookings stay on this device' : 'Live · secured by Telegram'}
        </p>
      </header>

      <div role="tablist" aria-label="Sections" className="mb-4 grid gap-1 rounded-xl bg-tg-section p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t) => (
          <button key={t.id} role="tab" type="button" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} data-testid={`tab-${t.id}`}
            onClick={() => { if (tab !== t.id) { haptic.select(); setTab(t.id); } }}
            className={`tap relative min-h-10 rounded-lg text-[14px] font-semibold transition-colors ${tab === t.id ? 'bg-tg-button text-tg-button-text shadow-sm' : 'text-tg-hint'}`}>
            {t.label}
            {t.id === 'bookings' && upcoming > 0 && <span className={`ml-1.5 rounded-full px-1.5 text-[11px] ${tab === t.id ? 'bg-tg-button-text/20' : 'bg-tg-button text-tg-button-text'}`}>{upcoming}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} key={tab} className="fade-in">
        {tab === 'book' && <ServiceList />}
        {tab === 'bookings' && <MyBookings />}
        {tab === 'studio' && adminEnabled && <Admin />}
      </div>
      <Footer />
    </div>
  );
}

function ServiceList() {
  const { catalog, setDraft, go, draft } = useApp();
  const { haptic } = useTg();
  return (
    <>
      {catalog.categories.map((cat, ci) => {
        const Icon = ICONS[cat.id] ?? Sparkles;
        const items = catalog.services.filter((s) => s.category === cat.id);
        if (!items.length) return null;
        return (
          <section key={cat.id} className="mb-5 stagger" style={{ animationDelay: `${ci * 50}ms` }}>
            <h2 className="mb-1.5 px-4 text-[13px] font-semibold tracking-wide text-tg-section-header uppercase">{cat.name}</h2>
            <ul className="overflow-hidden rounded-2xl bg-tg-section">
              {items.map((s) => (
                <li key={s.id} className="row-sep">
                  <button type="button" data-testid={`service-${s.id}`}
                    onClick={() => { haptic.select(); setDraft({ serviceId: s.id, staffId: draft.serviceId === s.id ? draft.staffId : 'any', slot: undefined, date: undefined }); go('staff'); }}
                    className="tap flex w-full items-center gap-3 px-4 py-3 text-left">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-tg-button/12 text-tg-accent" aria-hidden="true"><Icon className="size-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-medium">{s.name}</span>
                      <span className="block truncate text-[13px] text-tg-hint">{duration(s.durationMin)} · {s.description}</span>
                    </span>
                    <span className="text-[15px] font-semibold tabular-nums">{money(s.priceCents, catalog.currency)}</span>
                    <ChevronRight className="size-4 text-tg-hint" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function Footer() {
  const { repo, demoAdmin, setDemoAdmin, setTab, tab } = useApp();
  const { haptic } = useTg();
  return (
    <footer className="mt-6 mb-2 space-y-3 px-2 text-center text-[12px] leading-relaxed text-tg-hint">
      <p data-testid="privacy-note">{repo.mode === 'demo' ? studio.privacyNote : 'Live mode: bookings are stored by the studio and confirmed in your Telegram chat.'}</p>
      {repo.mode === 'demo' && (
        <label className="inline-flex cursor-pointer items-center gap-2.5 rounded-full bg-tg-section px-3 py-1.5 text-[13px] text-tg-text">
          <span>Studio admin demo</span>
          <button type="button" role="switch" aria-checked={demoAdmin} aria-label="Studio admin demo" data-testid="admin-toggle"
            onClick={() => { haptic.impact('light'); const v = !demoAdmin; setDemoAdmin(v); if (v) setTab('studio'); else if (tab === 'studio') setTab('book'); }}
            className={`relative h-6 w-10 rounded-full transition-colors ${demoAdmin ? 'bg-tg-button' : 'bg-tg-hint/40'}`}>
            <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${demoAdmin ? 'translate-x-4' : ''}`} />
          </button>
        </label>
      )}
      <p>{studio.demoLabel}</p>
    </footer>
  );
}
