import { useState } from 'react';

export default function SecurityPortal() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div
      className="bg-[#f8f9ff] font-['Inter'] text-[#171c22] min-h-screen flex items-center justify-center overflow-hidden"
      style={{ userSelect: 'none' }}
    >
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[60%] bg-[#f0f4fd] rounded-full blur-[120px] opacity-60" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[35%] h-[50%] bg-[#7af1fc]/20 rounded-full blur-[100px] opacity-40" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(#004275 0.5px, transparent 0.5px)',
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      {/* Main Container */}
      <main className="relative z-10 w-full max-w-screen-xl px-4 sm:px-8 py-10 md:py-0 flex flex-col md:flex-row items-center gap-10 md:gap-16">
        {/* Left Column */}
        <div className="hidden md:flex flex-col flex-1 max-w-md">
          <div className="mb-12 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#004275] text-4xl">verified_user</span>
            <h1 className="font-['Public_Sans'] text-3xl font-extrabold tracking-tight text-[#004275]">
              VeriLabel
            </h1>
          </div>
          <div className="space-y-8">
            <div>
              <h2 className="font-['Public_Sans'] text-4xl font-bold text-[#171c22] leading-tight mb-4">
                Clinical Precision in{' '}
                <span className="text-[#006970]">Data Extraction.</span>
              </h2>
              <p className="text-[#414750] text-lg leading-relaxed">
                Access your HIPAA-compliant dashboard to manage, verify, and archive clinical records
                with traceable audit logs.
              </p>
            </div>

            {/* Traceability Ledger */}
            <div className="bg-[#d6dae3]/30 rounded-xl p-6 space-y-4 border-l-4 border-[#004275] shadow-sm backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#414750]">
                  System Status: Active
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#006970]" />
                  <span className="text-xs font-medium text-[#006970]">Secure Connection</span>
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { time: '08:42:11 - AUTH_REQ', status: 'ENCRYPTED' },
                  { time: '08:42:12 - HANDSHAKE', status: 'VERIFIED' },
                ].map(({ time, status }) => (
                  <div key={time} className="flex justify-between text-[11px] font-mono text-[#414750]/70">
                    <span>{time}</span>
                    <span className="text-[#005a9c]">{status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Login */}
        <div className="w-full max-w-[440px] flex flex-col items-center">
          {/* Mobile Brand */}
          <div className="md:hidden mb-8 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#004275] text-3xl">verified_user</span>
            <span className="font-['Public_Sans'] text-2xl font-bold tracking-tight text-[#004275]">
              VeriLabel
            </span>
          </div>

          {/* Login Card */}
          <div className="w-full bg-white/80 backdrop-blur-[16px] rounded-xl p-6 sm:p-10 shadow-[0px_12px_32px_rgba(23,28,34,0.06)] relative overflow-hidden">
            <div className="mb-10">
              <h3 className="font-['Public_Sans'] text-2xl font-bold text-[#171c22] mb-2">
                Portal Access
              </h3>
              <p className="text-sm text-[#414750]">
                Enterprise authentication required for record access.
              </p>
            </div>

            <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
              {/* Email */}
              <div className="space-y-2">
                <label
                  className="text-xs font-semibold uppercase tracking-wider text-[#414750]"
                  htmlFor="email"
                >
                  Work Email
                </label>
                <div className="relative">
                  <input
                    className="w-full bg-[#dee3eb] border-0 border-b-2 border-[#c1c7d2]/20 focus:border-[#004275] focus:ring-0 px-0 py-3 text-[#171c22] placeholder:text-[#727781]/40 transition-all text-sm"
                    id="email"
                    placeholder="name@organization.com"
                    type="email"
                  />
                  <span className="material-symbols-outlined absolute right-0 top-1/2 -translate-y-1/2 text-[#727781]/30 text-xl">
                    alternate_email
                  </span>
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <label
                    className="text-xs font-semibold uppercase tracking-wider text-[#414750]"
                    htmlFor="password"
                  >
                    Password
                  </label>
                  <a
                    href="#"
                    className="text-[11px] font-semibold text-[#004275] hover:text-[#006970] transition-colors uppercase tracking-tighter"
                  >
                    Forgot?
                  </a>
                </div>
                <div className="relative">
                  <input
                    className="w-full bg-[#dee3eb] border-0 border-b-2 border-[#c1c7d2]/20 focus:border-[#004275] focus:ring-0 px-0 py-3 text-[#171c22] placeholder:text-[#727781]/40 transition-all text-sm"
                    id="password"
                    placeholder="••••••••"
                    type={showPassword ? 'text' : 'password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="material-symbols-outlined absolute right-0 top-1/2 -translate-y-1/2 text-[#727781]/30 text-xl"
                  >
                    {showPassword ? 'visibility' : 'lock'}
                  </button>
                </div>
              </div>

              {/* Security Indicator */}
              <div className="flex items-center gap-3 py-2">
                <div className="flex-1 h-1 bg-[#e4e8f1] rounded-full overflow-hidden">
                  <div className="h-full w-2/3 bg-[#006970] rounded-full" />
                </div>
                <span className="text-[10px] font-semibold text-[#006970] uppercase tracking-widest">
                  Secure Entry
                </span>
              </div>

              <div className="pt-4 space-y-4">
                <button
                  className="w-full text-white font-['Inter'] text-sm font-bold uppercase tracking-[0.05em] py-4 rounded-lg shadow-md hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #004275 0%, #005a9c 100%)' }}
                  type="submit"
                >
                  <span>Authenticate</span>
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </button>
                <button
                  className="w-full bg-[#dee3eb] text-[#171c22] font-['Inter'] text-sm font-bold uppercase tracking-[0.05em] py-4 rounded-lg hover:bg-[#e4e8f1] transition-colors"
                  type="button"
                >
                  Request Portal Access
                </button>
              </div>
            </form>

            {/* Compliance Footer */}
            <div className="mt-10 pt-8 border-t border-[#c1c7d2]/10 flex justify-between items-center text-[10px] text-[#414750] font-medium">
              <span className="flex items-center gap-1">
                <span
                  className="material-symbols-outlined text-[12px] text-[#006970]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  security
                </span>
                AES-256 ENCRYPTION
              </span>
              <span>v4.8.29-PRO</span>
            </div>
          </div>

          {/* Footer Links */}
          <div className="mt-8 flex flex-wrap justify-center gap-4 sm:gap-6">
            {['Privacy Policy', 'Terms of Service', 'Trust Center'].map((link) => (
              <a
                key={link}
                href="#"
                className="text-xs font-medium text-[#414750] hover:text-[#004275] transition-colors"
              >
                {link}
              </a>
            ))}
          </div>
        </div>
      </main>

      {/* Floating Nodes */}
      <div className="fixed top-24 left-12 hidden lg:block animate-pulse">
        <div className="bg-white/80 backdrop-blur-md px-4 py-3 rounded-xl shadow-sm flex items-center gap-3 border-l-4 border-[#006970]">
          <span className="material-symbols-outlined text-[#006970]">clinical_notes</span>
          <div>
            <p className="text-[10px] font-bold text-[#171c22] uppercase tracking-tight">
              Active Verifications
            </p>
            <p className="text-[14px] font-['Public_Sans'] font-bold text-[#004275]">
              1,204 Records
            </p>
          </div>
        </div>
      </div>

      <div className="fixed bottom-24 right-12 hidden lg:block">
        <div className="bg-white/80 backdrop-blur-md px-4 py-3 rounded-xl shadow-sm flex items-center gap-3 border-l-4 border-[#6a3100]">
          <span className="material-symbols-outlined text-[#6a3100]">policy</span>
          <div>
            <p className="text-[10px] font-bold text-[#171c22] uppercase tracking-tight">
              Compliance Score
            </p>
            <p className="text-[14px] font-['Public_Sans'] font-bold text-[#6a3100]">99.8% Match</p>
          </div>
        </div>
      </div>
    </div>
  );
}