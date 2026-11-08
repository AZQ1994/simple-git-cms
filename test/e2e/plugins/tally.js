// A plugin field for the browser tests: it reads two other fields, hears when one changes, and hands
// back a group with a list in it, which the editor has to write into the frontmatter as it is. It
// also hands its value back while it mounts, which mustn't count as someone changing the article.
export function mount(el, { value, get, set, onFieldChange }) {
  const button = Object.assign(document.createElement('button'), { type: 'button', id: 'tally-count', textContent: 'Count' });
  const out = Object.assign(document.createElement('output'), { id: 'tally-out', textContent: value ? `${value.seats} seats` : 'nothing yet' });
  const heard = Object.assign(document.createElement('span'), { id: 'tally-heard' });
  button.addEventListener('click', () => {
    const seats = get('seats');
    set({ seats, venue: get('venue'), rows: [{ label: 'Hall', seats }] });
    out.textContent = `${seats} seats`;
  });
  onFieldChange((name) => (heard.textContent = name));
  // Working the value out again as it opens, as a plugin that computes one would: not an edit
  if (value) set({ ...value });
  el.append(button, out, heard);
}
