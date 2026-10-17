export const SKILLS: Record<string, string> = {
  medical: 'Medical', first_aid: 'First aid', nursing: 'Nursing', counselling: 'Counselling', teaching: 'Teaching', tutoring: 'Tutoring',
  driving: 'Driving', logistics: 'Logistics', cooking: 'Cooking', construction: 'Construction', photography: 'Photography',
  social_media: 'Social media', design: 'Design', tech: 'Tech', translation: 'Translation', event_management: 'Event management',
  fundraising: 'Fundraising', legal: 'Legal aid', animal_care: 'Animal care', elder_care: 'Elder care', child_care: 'Child care',
  disaster_response: 'Disaster response', environment: 'Environment', sign_language: 'Sign language', general: 'General help',
};

export const EVENT_CATEGORIES: Record<string, { label: string; emoji: string }> = {
  volunteering: { label: 'Volunteering drive', emoji: '🙌' },
  donation_camp: { label: 'Donation camp', emoji: '📦' },
  blood_camp: { label: 'Blood donation camp', emoji: '🩸' },
  disaster_relief: { label: 'Disaster relief', emoji: '🆘' },
  cleanup: { label: 'Clean-up', emoji: '🧹' },
  education: { label: 'Education', emoji: '📚' },
  health: { label: 'Health', emoji: '🩺' },
  environment: { label: 'Environment', emoji: '🌱' },
  animal_welfare: { label: 'Animal welfare', emoji: '🐾' },
  elder_care: { label: 'Elder care', emoji: '🧓' },
  fundraiser: { label: 'Fundraiser', emoji: '💛' },
  awareness: { label: 'Awareness', emoji: '📣' },
  other: { label: 'Other', emoji: '✨' },
};

export const RESOURCE_CATEGORIES: Record<string, string> = {
  food: 'Food', clothing: 'Clothing', medical: 'Medical supplies', education: 'Education', shelter: 'Shelter',
  hygiene: 'Hygiene', disaster_relief: 'Disaster relief', other: 'Other',
};

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Bombay (hh)'];
export const RARE_GROUPS = ['A-', 'B-', 'AB-', 'O-', 'Bombay (hh)'];
export const BLOOD_COMPONENTS: Record<string, string> = { whole_blood: 'Whole blood', platelets: 'Platelets', plasma: 'Plasma', red_cells: 'Packed red cells' };

export const REPORT_REASONS: Record<string, string> = {
  spam: 'Spam', scam_or_fraud: 'Scam or fraud', harassment: 'Harassment or bullying', hate_speech: 'Hate speech',
  inappropriate_content: 'Inappropriate content', impersonation: 'Impersonation', safety_concern: 'Safety concern',
  misinformation: 'False information', minor_safety: 'Child safety concern', other: 'Something else',
};

export const ROLE_LABEL: Record<string, string> = { volunteer: 'Volunteer', organizer: 'Organizer', csr: 'CSR company', admin: 'Administrator' };
export const ORG_TYPE_LABEL: Record<string, string> = { ngo: 'NGO / Non-profit', independent: 'Independent organizer', company: 'Company (CSR)' };

export const label = (map: Record<string, any>, key: string) => {
  const v = map[key];
  return typeof v === 'string' ? v : v?.label ?? key.replace(/_/g, ' ');
};
