import { apiUrl } from './api.js';
import {
  AudioLines,
  Film,
  MapPinned,
  Megaphone,
  Navigation,
  PlaySquare,
  Search,
} from 'lucide-react';

export const DOMAINS = [
  {
    id: 'generative-media',
    title: 'Generative Image & Video',
    short: 'Generative media',
    summary:
      'Grade visual realism, prompt alignment, motion fidelity and safety across synthetic imagery and short video.',
    Icon: Film,
  },
  {
    id: 'search',
    title: 'Search Relevance',
    short: 'Search quality',
    summary: 'Assess intent satisfaction, factual grounding, freshness and locality across real result pages.',
    Icon: Search,
  },
  {
    id: 'ads',
    title: 'Online Ads Assessment',
    short: 'Ads',
    summary: 'Review commercial relevance, query alignment and landing experience quality for paid placements.',
    Icon: Megaphone,
  },
  {
    id: 'media',
    title: 'Media Search Analysis',
    short: 'Media',
    summary: 'Verify discovery accuracy across music, film, podcasts and app store search experiences.',
    Icon: PlaySquare,
  },
  {
    id: 'audio',
    title: 'Audio & Speech',
    short: 'Audio',
    summary: 'Transcribe spoken utterances and score voice naturalness, pronunciation, pacing and fidelity.',
    Icon: AudioLines,
  },
  {
    id: 'poi',
    title: 'POI Validation',
    short: 'Maps',
    summary: 'Validate listings, categories, hours, addresses and coordinates against official sources.',
    Icon: MapPinned,
  },
  {
    id: 'local',
    title: 'Local Search & Maps',
    short: 'Local',
    summary: 'Evaluate map results, proximity ranking, route accuracy and geographic intent.',
    Icon: Navigation,
  },
];

export const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'Studio' },
  { to: '/careers', label: 'Careers' },
  { to: '/contact', label: 'Contact' },
];

export const FALLBACK_INFO = {
  companyName: 'AI Square IT Solutions',
  mission: 'Give machines better judgement by placing rigorous human reasoning at the centre of every model we touch.',
  vision:
    'A world where AI systems are shaped by trained evaluators, transparent rubrics and measurable quality — not guesswork.',
  values: ['Rubric before opinion', 'Evidence over intuition', 'Craft in every detail', 'Respect for the people behind the data'],
  email: 'hello@aisquare.work',
  phone: '+91 40 4000 8181',
  address: 'AISQUARE Studio, HITEC City, Hyderabad, Telangana 500081, India',
  hours: 'Monday – Friday · 10:00 – 19:00 IST',
  mapLink: 'https://maps.google.com/?q=HITEC+City+Hyderabad',
  linkedin: 'https://www.linkedin.com/company/aisquare-it-solutions',
  careersNote: 'Remote-first evaluation cohorts across India, with studio space in Hyderabad.',
  privacyNote: 'Write to privacy@aisquare.work for data access, correction and deletion requests. We respond within 30 days.',
  demoMode: true,
};

export const PROCESS_STEPS = [
  {
    step: '01',
    title: 'Calibrate on the rubric',
    body: 'Read version-controlled guidelines, acknowledge them, and clear a practical calibration assessment before touching live work.',
  },
  {
    step: '02',
    title: 'Prove project readiness',
    body: 'Each project has explicit score thresholds. Your readiness is evaluated automatically, with manual review where judgement matters.',
  },
  {
    step: '03',
    title: 'Evaluate with evidence',
    body: 'Score inside a focused workspace, justify every decision, and keep a measurable record of quality over time.',
  },
];

let cachedInfo = null;
let inflight = null;

export async function loadCompanyInfo() {
  if (cachedInfo) return cachedInfo;
  if (inflight) return inflight;
  inflight = fetch(apiUrl('/api/public/info'))
    .then((response) => (response.ok ? response.json() : FALLBACK_INFO))
    .then((data) => {
      cachedInfo = { ...FALLBACK_INFO, ...data };
      inflight = null;
      return cachedInfo;
    })
    .catch(() => {
      inflight = null;
      return FALLBACK_INFO;
    });
  return inflight;
}

export function getCompanyInfoSync() {
  return cachedInfo || FALLBACK_INFO;
}
