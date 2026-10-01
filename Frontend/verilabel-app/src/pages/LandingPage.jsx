import { useState } from "react";
import { useNavigate } from "react-router-dom";

const NAV_LINKS = [
  { label: 'Home', href: '/', active: true },
  { label: 'Records', href: '/records' },
  { label: 'Upload', href: '/upload' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="bg-[#f8f9ff] text-[#171c22] font-['Inter'] selection:bg-[#d2e4ff] selection:text-[#001c37]">
      {/* Navbar */}
      <nav className="w-full top-0 z-50 bg-white shadow-sm sticky">
        <div className="flex justify-between items-center px-4 sm:px-8 py-4 gap-4">
          <div className="flex items-center gap-8">
            <span className="text-2xl font-bold text-[#004275] font-['Public_Sans'] tracking-tight">
              VeriLabel
            </span>
            <div className="hidden md:flex gap-6">
              {NAV_LINKS.map(({ label, href, active }) => (
                <a
                  key={label}
                  href={href}
                  className={`font-['Public_Sans'] font-semibold tracking-tight ${
                    active
                      ? 'text-[#004275] border-b-2 border-[#004275] pb-1'
                      : 'text-[#414750] hover:text-[#004275] transition-colors'
                  }`}
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button className="p-2 text-[#414750] hover:bg-[#f0f4fd] transition-colors rounded-full">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button className="hidden sm:flex items-center gap-2 p-1 pr-3 rounded-full hover:bg-[#f0f4fd] transition-colors">
              <span className="material-symbols-outlined">account_circle</span>
              <span className="text-sm font-medium">Compliance Officer</span>
            </button>
            <button
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
              className="md:hidden p-2 text-[#414750] hover:bg-[#f0f4fd] transition-colors rounded-full"
              aria-label="Toggle navigation menu"
              aria-expanded={isMenuOpen}
            >
              <span className="material-symbols-outlined">{isMenuOpen ? 'close' : 'menu'}</span>
            </button>
          </div>
        </div>

        {isMenuOpen && (
          <div className="md:hidden border-t border-[#c1c7d2]/20 bg-white px-4 py-3 flex flex-col gap-1">
            {NAV_LINKS.map(({ label, href, active }) => (
              <a
                key={label}
                href={href}
                onClick={() => setIsMenuOpen(false)}
                className={`px-3 py-3 rounded-lg font-['Public_Sans'] font-semibold tracking-tight ${
                  active ? 'text-[#004275] bg-[#f0f4fd]' : 'text-[#414750] hover:text-[#004275] hover:bg-[#f0f4fd] transition-colors'
                }`}
              >
                {label}
              </a>
            ))}
          </div>
        )}
      </nav>

      <main>
        {/* Hero */}
        <section className="relative px-8 pt-20 pb-32 overflow-hidden bg-[#f8f9ff]">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-16">
            <div className="flex-1 space-y-8 z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#7af1fc] text-[#006e75] rounded-full text-xs font-semibold tracking-widest uppercase">
                <span
                  className="material-symbols-outlined text-sm"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  verified
                </span>
                Traceable Data Extraction
              </div>
              <h1 className="text-5xl md:text-6xl font-extrabold font-['Public_Sans'] text-[#171c22] leading-[1.1] tracking-tight">
                Precision Medicine <br />
                <span className="text-[#004275]">Compliance for Labels.</span>
              </h1>
              <p className="text-lg text-[#414750] max-w-lg leading-relaxed">
                Automated OCR extraction and AI validation for healthcare professionals. Ensure every
                medicine label meets stringent regulatory standards with audited clinical precision.
              </p>
              <div className="flex flex-wrap gap-4 pt-4">
                <button
                  onClick={() => navigate('/upload')}
                  className="text-white px-8 py-4 rounded-lg font-['Inter'] font-bold text-sm tracking-widest uppercase shadow-lg shadow-[#004275]/20 hover:scale-[1.02] transition-transform"
                  style={{ background: 'linear-gradient(135deg, #004275 0%, #005a9c 100%)' }}
                >
                  Upload Medicine Label
                </button>
                <button
                  onClick={() => navigate('/records')}
                  className="bg-[#dee3eb] text-[#171c22] px-8 py-4 rounded-lg font-['Inter'] font-bold text-sm tracking-widest uppercase hover:bg-[#e4e8f1] transition-colors"
                >
                  My Records
                </button>
              </div>
            </div>

            <div className="flex-1 relative">
              <div className="absolute -top-20 -right-20 w-96 h-96 bg-[#d2e4ff]/30 rounded-full blur-[100px]" />
              <div className="relative bg-white/80 backdrop-blur-[12px] rounded-xl p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex gap-2">
                    {['bg-[#ba1a1a]', 'bg-[#6a3100]', 'bg-[#006970]'].map((c) => (
                      <div key={c} className={`w-3 h-3 rounded-full ${c}`} />
                    ))}
                  </div>
                  <span className="text-[10px] font-mono text-[#727781] uppercase tracking-tighter">
                    Extraction Console v2.4
                  </span>
                </div>
                <div className="space-y-4">
                  <div className="bg-white p-4 rounded-lg">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="material-symbols-outlined text-[#006970]">pill</span>
                      <span className="text-xs font-bold text-[#171c22] uppercase tracking-wider">
                        Detected Substance
                      </span>
                    </div>
                    <div className="h-6 bg-[#e4e8f1] w-3/4 rounded animate-pulse" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#f0f4fd] p-4 rounded-lg">
                      <span className="text-[10px] text-[#414750] uppercase block mb-1">
                        Confidence Score
                      </span>
                      <span className="text-xl font-['Public_Sans'] font-bold text-[#006970]">
                        99.8%
                      </span>
                    </div>
                    <div className="bg-[#f0f4fd] p-4 rounded-lg">
                      <span className="text-[10px] text-[#414750] uppercase block mb-1">
                        Regulatory Match
                      </span>
                      <span className="text-xl font-['Public_Sans'] font-bold text-[#004275]">
                        Verified
                      </span>
                    </div>
                  </div>
                  <img
                    className="w-full h-48 object-cover rounded-lg"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuAMd2SuSAWE6Ggb2nipTkU9UgVP_s9NnJqygKIRD9tuxecGp9yFuB-GJilQtig4z1wNk0QFK5ev3mVOvgi9o6rQlAmRJLAZ025aqbNfgrcQ7_R_VUoqB0foT8JjYSvsxbE90Ii0NDUvGIqu3ylymgIukGAqEhCxfCcsjPORP81zcVS5uLTKo4K-P5SXPrHdGaXDyFzp3PynyhPkCmGokg0dsA2Grsy0OVnn4LZc0cdd1gnfRcAdxno8LdrUzxtA0IByQNdv2DCahUs"
                    alt="Medical laboratory testing setup"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why It Matters */}
        <section className="py-24 px-8 bg-[#f0f4fd]">
          <div className="max-w-7xl mx-auto">
            <div className="mb-16">
              <h2 className="text-3xl font-bold font-['Public_Sans'] mb-4">Why It Matters</h2>
              <div className="h-1 w-20 bg-[#004275]" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              <div className="md:col-span-8 bg-white p-10 rounded-xl flex flex-col justify-between">
                <div className="max-w-md">
                  <span className="material-symbols-outlined text-4xl text-[#004275] mb-6 block">
                    health_metrics
                  </span>
                  <h3 className="text-2xl font-bold font-['Public_Sans'] mb-4 text-[#171c22]">
                    Uncompromising Accuracy
                  </h3>
                  <p className="text-[#414750] leading-relaxed">
                    In healthcare, a single misplaced decimal can be catastrophic. Our Clinical
                    Architect engine ensures data extraction accuracy exceeds 99.9%, cross-referencing
                    against global pharmacopoeia databases.
                  </p>
                </div>
                <div className="mt-8 flex items-center gap-4 text-[#004275] font-bold text-sm tracking-widest uppercase">
                  Learn about validation protocols
                  <span className="material-symbols-outlined">arrow_forward</span>
                </div>
              </div>

              <div className="md:col-span-4 bg-[#004275] text-white p-10 rounded-xl">
                <span className="material-symbols-outlined text-4xl mb-6 block">security</span>
                <h3 className="text-2xl font-bold font-['Public_Sans'] mb-4">
                  Patient Safety First
                </h3>
                <p className="text-[#afd1ff] leading-relaxed">
                  Automated verification removes human fatigue from the compliance workflow,
                  significantly reducing the risk of mislabeling and medication errors.
                </p>
              </div>

              <div className="md:col-span-4 bg-[#006970] p-10 rounded-xl text-white">
                <span
                  className="material-symbols-outlined text-4xl mb-6 block"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  verified_user
                </span>
                <h3 className="text-xl font-bold font-['Public_Sans'] mb-4">
                  Regulatory Audit Trails
                </h3>
                <p className="text-[#7af1fc] text-sm leading-relaxed">
                  Every extraction creates a permanent, immutable log. Trace every data point back to
                  its source image with timestamped officer validation.
                </p>
              </div>

              <div className="md:col-span-8 bg-[#dee3eb] p-10 rounded-xl flex items-center gap-10">
                <div className="hidden sm:block flex-shrink-0">
                  <img
                    className="w-32 h-32 rounded-full object-cover grayscale opacity-50"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuDIAkpgLXV6JhKyAlnNeF_80fiSJOindLFKy59DZoyP6Xl7jAxlXTb8xziPLKLPiqleKmveHxu1SumlUrZaPq-JhmUNqPcJ_eL_l5bnUYyxvmOPSKHMwZFuxo9N0sNVgZQyTjhNUiFP-uCkfvRyOq74ZbXHYDomPzh7t_f8qG_AhxiKlxHeB3SwvAOfiRQGhmvnkOupaI_TQfyYqCfpen34DV9T2SpAFhtyRR8BhTAnt3O8Z5Q8mrsrtpF2VXq0nMwytYPkAgCvf8c"
                    alt="Medical professional"
                  />
                </div>
                <div>
                  <h3 className="text-xl font-bold font-['Public_Sans'] mb-2">Enterprise Ready</h3>
                  <p className="text-[#414750]">
                    Designed for scale. Integrate with existing Hospital Information Systems (HIS) via
                    our secure REST API for seamless data flow.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-24 px-8 bg-[#f8f9ff]">
          <div className="max-w-7xl mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-20">
              <h2 className="text-4xl font-bold font-['Public_Sans'] mb-6">
                From Physical to Digital
              </h2>
              <p className="text-[#414750]">
                Our three-step validation pipeline turns complex packaging labels into structured,
                actionable clinical data.
              </p>
            </div>
            <div className="relative">
              <div className="hidden lg:block absolute top-1/2 left-0 w-full h-px bg-[#c1c7d2]/30 -translate-y-1/2 z-0" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 relative z-10">
                {[
                  {
                    icon: 'document_scanner',
                    title: 'OCR Extraction',
                    desc: 'High-resolution scanning captures text even from curved vials or reflective blister packs with localized context awareness.',
                  },
                  {
                    icon: 'psychology',
                    title: 'AI Validation',
                    desc: 'Extracted data is validated against a 14M+ drug database to verify active ingredients, dosages, and expiration formats.',
                  },
                  {
                    icon: 'fact_check',
                    title: 'Human Verification',
                    desc: 'Final clinical approval by a compliance officer. The system highlights anomalies, ensuring 100% human-overseen truth.',
                  },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="flex flex-col items-center text-center">
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center text-white mb-8 shadow-xl"
                      style={{ background: 'linear-gradient(135deg, #004275 0%, #005a9c 100%)' }}
                    >
                      <span className="material-symbols-outlined text-2xl">{icon}</span>
                    </div>
                    <h3 className="text-xl font-bold font-['Public_Sans'] mb-4">{title}</h3>
                    <p className="text-[#414750] text-sm leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Who It's For */}
        <section className="py-24 px-8 bg-[#f0f4fd]">
          <div className="max-w-7xl mx-auto">
            <div className="mb-16">
              <h2 className="text-3xl font-bold font-['Public_Sans'] mb-4">
                Trusted Across the Clinical Ecosystem
              </h2>
              <p className="text-[#414750]">
                A versatile solution tailored to the specific needs of healthcare stakeholders.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  icon: 'medical_services',
                  title: 'Pharmacists',
                  desc: 'Quickly verify incoming medication stock against digital orders to prevent dispensing errors and manage inventory with high-fidelity data.',
                },
                {
                  icon: 'domain',
                  title: 'Hospitals',
                  desc: 'Centralize compliance across multiple departments. Reduce liability and improve patient outcomes through standardized labeling protocols.',
                },
                {
                  icon: 'policy',
                  title: 'Compliance Teams',
                  desc: 'Effortlessly manage audits with comprehensive traceability logs. Generate regulatory reports in seconds rather than days.',
                },
              ].map(({ icon, title, desc }) => (
                <div
                  key={title}
                  className="bg-white p-8 rounded-lg group hover:bg-[#004275] transition-all duration-300"
                >
                  <div className="w-12 h-12 bg-[#f0f4fd] rounded flex items-center justify-center mb-6 group-hover:bg-[#005a9c] transition-colors">
                    <span className="material-symbols-outlined text-[#004275] group-hover:text-[#afd1ff]">
                      {icon}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold font-['Public_Sans'] mb-3 group-hover:text-white">
                    {title}
                  </h3>
                  <p className="text-[#414750] group-hover:text-[#afd1ff] text-sm leading-relaxed mb-6">
                    {desc}
                  </p>
                  <div className="h-1 w-10 bg-[#006970] rounded group-hover:bg-[#7df4ff]" />
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}