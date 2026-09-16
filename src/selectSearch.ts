import PinyinMatch from 'pinyin-match';

export type SelectOption = { value: string; label: string; keywords?: string[] };

export function filterOptions(options: readonly SelectOption[], query: string): SelectOption[] {
  const keyword = query.trim().toLowerCase();
  return options.filter(option => !keyword || option.value.toLowerCase().includes(keyword)
    || [option.label, ...(option.keywords || [])].some(text => text.toLowerCase().includes(keyword) || !!PinyinMatch.match(text, keyword)));
}
