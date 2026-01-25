import { User } from '../types.ts';

// Mock Auth0 User Service
export class UserService {
  private static currentUser: User | null = null;
  private static listeners: ((user: User | null) => void)[] = [];
  private static initialized = false;
  private static STORAGE_KEY = 'auth0_session_user';

  static initialize() {
    if (this.initialized) return;
    this.initialized = true;

    // Check for existing session
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      try {
        this.currentUser = JSON.parse(stored);
      } catch (e) {
        localStorage.removeItem(this.STORAGE_KEY);
      }
    }
    
    this.notifyListeners();
  }

  static getCurrentUser(): User | null {
    if (!this.initialized) this.initialize();
    return this.currentUser;
  }

  static async login() {
    // Simulate Auth0 Universal Login Redirect/Popup delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // Create a mock Auth0 profile
    const mockUser: User = {
      id: 'auth0|' + Math.random().toString(36).substr(2, 9),
      username: 'engineering_lead',
      name: 'Demo Architect',
      email: 'architect@buildsheet.demo',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=engineering'
    };

    this.currentUser = mockUser;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(mockUser));
    this.notifyListeners();
  }

  static async logout() {
    await new Promise(resolve => setTimeout(resolve, 300));
    this.currentUser = null;
    localStorage.removeItem(this.STORAGE_KEY);
    this.notifyListeners();
  }

  static onUserChange(callback: (user: User | null) => void) {
    if (!this.initialized) this.initialize();
    this.listeners.push(callback);
    // Immediately fire with current state
    callback(this.currentUser);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private static notifyListeners() {
    this.listeners.forEach(l => l(this.currentUser));
  }
}