export const I={paw:'M6.5 12.5a2.6 2.6 0 0 1 2.2-1.2h6.6a2.6 2.6 0 0 1 2.2 1.2c1.4 2.1.6 5.1-1.7 5.9-1.2.4-2.2-.2-3.8-.2s-2.6.6-3.8.2c-2.3-.8-3.1-3.8-1.7-5.9Z M7 5.6c.9-.5 2.1 0 2.6 1.2.5 1.2.2 2.5-.7 3-.9.5-2.1-.1-2.6-1.3-.5-1.2-.2-2.4.7-2.9Z M17 5.6c-.9-.5-2.1 0-2.6 1.2-.5 1.2-.2 2.5.7 3 .9.5 2.1-.1 2.6-1.3.5-1.2.2-2.4-.7-2.9Z M3.4 10.6c.8-.4 1.8.1 2.2 1.1 M20.6 10.6c-.8-.4-1.8.1-2.2 1.1',
shield:'M12 3 5 6v5.6c0 4 2.9 7.6 7 8.9 4.1-1.3 7-4.9 7-8.9V6l-7-3Z M9.2 12.1l2 2 3.6-3.8',
bell:'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
search:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z M20 20l-4-4',
chat:'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5Z',
plus:'M12 5v14 M5 12h14',check:'M5 12.8 9.6 17.4 19 8',x:'M6 6l12 12 M18 6 6 18',
flag:'M6 21V4 M6 5h11l-2.2 3.6L17 12H6',clock:'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z M12 7.6V12l3 1.8',
tag:'M4 4h7l9 9-7 7-9-9Z M8 8h.01',pin:'M12 21s6.5-5.7 6.5-10.3A6.5 6.5 0 0 0 5.5 10.7C5.5 15.3 12 21 12 21Z M12 12.4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
grid:'M4 4h7v7H4Z M13 4h7v7h-7Z M4 13h7v7H4Z M13 13h7v7h-7Z',
list:'M4 6h16 M4 12h16 M4 18h10',user:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4.5 20a7.5 7.5 0 0 1 15 0',
bolt:'M13 3 5 13h6l-1 8 8-10h-6l1-8Z',doc:'M6 3h8l4 4v14H6Z M14 3v4h4 M9 12h6 M9 16h6',
syringe:'M4 20l3.5-3.5 M8 16l-2 2 4 4 2-2Z M10.5 13.5 17 7l-3-3-6.5 6.5Z M15 2.5 21.5 9',
heart:'M12 20s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.7-7 9-7 9Z',
arrow:'M5 12h14 M13 6l6 6-6 6',chevron:'M9 18l6-6-6-6',logout:'M10 17l5-5-5-5 M15 12H3 M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6'};
export const ic=(n,s=18,st=2)=>`<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="${st}" stroke-linecap="round" stroke-linejoin="round">${I[n].split(' M').map((d,i)=>`<path d="${i?'M'+d:d}"/>`).join('')}</svg>`;
export const HUE={Dog:'linear-gradient(135deg,#ffd9d4,#ffb9b0)',Cat:'linear-gradient(135deg,#ffeec2,#ffd479)',Rabbit:'linear-gradient(135deg,#d6f5ee,#a9e8dc)',Bird:'linear-gradient(135deg,#dde6ff,#bcd0ff)'};
