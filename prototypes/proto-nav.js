// Tiny switcher so you can flick between the three prototypes on one device.
export function protoNav(current) {
  const items = [
    { id: 'a', label: 'A · Funnel', href: 'bracket-a.html' },
    { id: 'b', label: 'B · Bracket tree', href: 'bracket-b.html' },
    { id: 'c', label: 'C · Vertical', href: 'bracket-c.html' },
  ];
  const nav = document.createElement('nav');
  nav.className = 'proto-bar';
  const label = document.createElement('span');
  label.textContent = 'Pick a layout:';
  nav.append(label);
  for (const it of items) {
    const a = document.createElement('a');
    a.href = it.href;
    a.textContent = it.label;
    if (it.id === current) a.className = 'current';
    nav.append(a);
  }
  const back = document.createElement('a');
  back.href = '../index.html';
  back.textContent = 'Live dashboard';
  nav.append(back);
  return nav;
}
