import { Link, useLocation } from 'react-router-dom';

export default function Sidebar() {
  const { pathname } = useLocation();

  const navItems = [
    { label: 'Dashboard', to: '/dashboard', icon: 'dashboard' },
    { label: 'Pending Review', to: '/pending', icon: 'pending_actions' },
    { label: 'Verified', to: '/records', icon: 'verified' },
    { label: 'Archive', to: '/archive', icon: 'archive' },
  ];

  return (
    <aside className="hidden md:flex bg-[#f0f4fd] w-64 flex-shrink-0 flex-col py-6 h-full">
      <div className="px-6 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[#d2e4ff] flex items-center justify-center text-[#004275]">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>shield_person</span>
          </div>
          <div>
            <p className="text-sm font-bold text-[#171c22]" style={{ fontFamily: 'Public Sans, sans-serif' }}>Compliance Officer</p>
            <p className="text-[10px] text-[#414750] font-medium tracking-widest uppercase">ID: 8829</p>
          </div>
        </div>
        <Link
          to="/upload"
          className="w-full text-white py-3 rounded-lg text-[11px] font-bold tracking-widest uppercase flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
          style={{ background: 'linear-gradient(135deg, #004275 0%, #005a9c 100%)' }}
        >
          <span className="material-symbols-outlined text-sm">add</span>
          New Extraction
        </Link>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navItems.map(({ label, to, icon }) => {
          const active = pathname === to || pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 px-4 py-2 transition-all duration-150 text-sm font-medium rounded-md ${
                active
                  ? 'bg-white text-[#004275] border-l-4 border-[#004275]'
                  : 'text-slate-600 hover:bg-white/50'
              }`}
            >
              <span
                className="material-symbols-outlined"
                style={active ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {icon}
              </span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 border-t border-[#c1c7d2]/20 pt-4 space-y-1">
        <Link to="/settings" className="flex items-center gap-3 text-slate-600 px-4 py-2 hover:bg-white/50 transition-all duration-150 text-sm font-medium">
          <span className="material-symbols-outlined">settings</span>
          Settings
        </Link>
        <Link to="/support" className="flex items-center gap-3 text-slate-600 px-4 py-2 hover:bg-white/50 transition-all duration-150 text-sm font-medium">
          <span className="material-symbols-outlined">help</span>
          Support
        </Link>
      </div>
    </aside>
  );
}