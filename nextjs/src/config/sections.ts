export interface SectionConfig {
  id: string;
  offset: number; // pixels from top of viewport
  headingSize?: string; // e.g., 'text-4xl'
  headingSizeMobile?: string; // e.g., 'text-2xl'
}

export const sectionConfigs: SectionConfig[] = [
  {
    id: 'home',
    offset: 100,
    headingSize: 'text-6xl',
    headingSizeMobile: 'text-3xl',
  },
  {
    id: 'skills',
    offset: -50,
    headingSize: 'text-6xl',
    headingSizeMobile: 'text-xl',
  },
  {
    id: 'projects',
    offset: -90,
    headingSize: 'text-3xl',
    headingSizeMobile: 'text-xl',
  },
  {
    id: 'experience',
    offset: 0,
    headingSize: 'text-3xl',
    headingSizeMobile: 'text-xl',
  },
  {
    id: 'metrics',
    offset: -15,
    headingSize: 'text-3xl',
    headingSizeMobile: 'text-xl',
  },
];
