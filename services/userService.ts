
import { User } from '../types';

export const MOCK_USER: User = {
  id: 'auth0|65f1a2b3c4d5e6f7',
  username: 'hardware_lead_88',
  name: 'Alex Rivera',
  email: 'alex@buildsheet.io',
  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex'
};

export class UserService {
  private static currentUser: User | null = MOCK_USER;

  static getCurrentUser(): User | null {
    return this.currentUser;
  }

  static isAuthenticated(): boolean {
    return !!this.currentUser;
  }
}
