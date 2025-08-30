import { Result } from '@sapphire/result';

export async function safeFetchJSON<T>(url: string, options?: RequestInit): Promise<Result<T, string>> {
  try {
    const response = await fetch(url, options);

    // If response is not OK, handle as error
    if (!response.ok) {
      let errorText = '';
      try {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          errorText = JSON.stringify(await response.json());
        } else {
          errorText = await response.text() || 'Empty response body';
        }
      } catch {
        errorText = 'Failed to read response body';
      }
      return Result.err(`Failed to fetch '${url}' with code ${response.status} ${response.statusText}: ${errorText}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return Result.ok({} as T);
    }

    // Read response text first
    const text = await response.text();

    // Handle 200 OK with empty body
    if (response.status === 200 && (!text || text.trim() === '')) {
      return Result.ok({} as T);
    }

    // Check content type for JSON
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return Result.err(
        `Expected JSON response from '${url}', got ${contentType || 'no content-type'} with code ${response.status} ${response.statusText}: ${text || 'Empty response body'}`
      );
    }

    // Parse JSON
    const data = JSON.parse(text) as T;
    return Result.ok(data);

  } catch (err) {
    return Result.err(`Fetch error for '${url}': ${(err as Error).message || 'Unknown error'}`);
  }
}
