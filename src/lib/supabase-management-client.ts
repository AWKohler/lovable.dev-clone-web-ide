export class SupabaseManagementAPI {
  private accessToken: string;
  private baseUrl = 'https://api.supabase.com/v1';

  constructor(accessToken: string) {
    if (!accessToken) throw new Error('Supabase Management API requires access token');
    this.accessToken = accessToken;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      let details: unknown = undefined;
      try { details = await res.json(); } catch {}
      throw new Error(`Supabase API ${endpoint} failed ${res.status}: ${JSON.stringify(details)}`);
    }
    return res.json() as Promise<T>;
  }

  getOrganizations(): Promise<Record<string, unknown>[]> {
    return this.request('/organizations');
  }

  getProjects(): Promise<Record<string, unknown>[]> {
    return this.request('/projects');
  }

  getProject(projectRef: string): Promise<Record<string, unknown>> {
    return this.request(`/projects/${projectRef}`);
  }

  getProjectApiKeys(projectRef: string): Promise<Record<string, unknown>[]> {
    return this.request(`/projects/${projectRef}/api-keys`);
  }
}

