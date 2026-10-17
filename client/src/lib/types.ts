export type Role = 'volunteer' | 'organizer' | 'csr' | 'admin';

export interface UserCard {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  role: Role;
  verified: boolean;
  headline?: string | null;
}

export interface Badge {
  code: string;
  title: string;
  description: string;
  icon: string;
  awardedAt: string;
}

export interface Me {
  id: string;
  name: string;
  handle: string;
  email: string | null;
  phone: string | null;
  role: Role;
  emailVerified: boolean;
  phoneVerified: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
  avatarUrl: string | null;
  coverUrl: string | null;
  headline: string | null;
  bio: string | null;
  website: string | null;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  dateOfBirth: string | null;
  isMinor: boolean;
  guardianEmail: string | null;
  guardianConsent: 'not_required' | 'pending' | 'granted' | 'denied';
  orgType: string | null;
  orgRegistrationNo: string | null;
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  skills: string[];
  interests: string[];
  privacy: Record<string, 'public' | 'followers' | 'private'>;
  bloodGroup: string | null;
  isBloodDonor: boolean;
  donorRadiusKm: number;
  lastDonationDate: string | null;
  notificationPrefs: Record<string, any>;
  leaderboardOptOut: boolean;
  twoFactorEnabled: boolean;
  onboardingCompleted: boolean;
  accountStatus: 'active' | 'suspended' | 'deleted';
  suspendedReason: string | null;
  companyId: string | null;
  csrInviteCode: string | null;
  createdAt: string;
  badges: Badge[];
}

export interface Poll {
  id: string;
  question: string;
  multi: boolean;
  closesAt: string | null;
  closed: boolean;
  voters: number;
  options: { id: string; label: string; votes: number }[];
  myVotes: string[];
  creator: UserCard;
}

export interface Post {
  id: string;
  kind: 'post' | 'event' | 'request' | 'milestone' | 'gallery';
  body: string | null;
  media: { url: string; type: string }[];
  createdAt: string;
  updatedAt: string;
  author: UserCard;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  bookmarked: boolean;
  event: null | { id: string; title: string; startAt: string; endAt: string; locationName: string | null; coverUrl: string | null; category: string; status: string; capacity: number; registered: number };
  request: null | { id: string; type: 'resource'; title: string; category: string; status: string; coverUrl: string | null; needed: number; pledged: number };
  poll: Poll | null;
}

export interface EventCard {
  id: string;
  title: string;
  category: string;
  coverUrl: string | null;
  status: 'draft' | 'published' | 'completed' | 'cancelled';
  isOutdoor: boolean;
  startAt: string;
  endAt: string;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  capacity: number;
  skillsNeeded: string[];
  registered: number;
  waitlisted: number;
  organizer: { id: string; name: string; handle: string; avatarUrl: string | null; verified: boolean };
  distanceKm?: number | null;
  myStatus?: string;
  checkinCode?: string;
  waitlistPosition?: number;
}

export interface Paged<T> {
  items: T[];
  nextCursor: string | null;
}
