// packages/shared/src/interfaces/user.interface.ts
import { UserType, UserStatus, IdentityStatus } from '../enums/index';

export interface UserIdentity {
  id?: string;
  userId?: string;
  firstName?: string | null;
  lastName?: string | null;
  nationalCode?: string | null;
  birthDate?: string | null;
  status: IdentityStatus;
  verifiedAt?: string | null;
  createdAt?: string;
}

export interface LegalProfile {
  id?: string;
  userId?: string;
  companyName: string;
  nationalId: string;
  economicCode?: string | null;
  registrationNumber?: string | null;
  verified: boolean;
  representativeId?: string | null;
  createdAt?: string;
}

export interface UserData {
  id?: string;
  name: string; 
  phone: string;
  type?: UserType;
  status?: UserStatus;
  referralCode?: string;
  createdAt?: string;
  updatedAt?: string;
  identity?: UserIdentity | null;
  legalProfile?: LegalProfile | null;
}