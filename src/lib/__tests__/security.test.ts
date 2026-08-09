import { getSafeRedirect, serializeForInlineScript } from '../security';

describe('security helpers', () => {
  it('accepts only same-origin redirect paths', () => {
    expect(getSafeRedirect('/search?q=test')).toBe('/search?q=test');
    expect(getSafeRedirect('https://example.com')).toBe('/');
    expect(getSafeRedirect('//example.com')).toBe('/');
    expect(getSafeRedirect(null)).toBe('/');
  });

  it('escapes characters that can break an inline script', () => {
    const serialized = serializeForInlineScript({ value: '</script>&' });
    expect(serialized).not.toContain('</script>');
    expect(serialized).toContain('\\u003c/script\\u003e\\u0026');
  });
});
