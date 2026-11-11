/*
 * The Icons tab's catalogue: simple line icons (lucide-react, tinted with the
 * chosen colour) and multicolour stickers (react-icons' Flat Color set). An
 * inserted one becomes an ordinary board picture through svgToDataUrl, so
 * the live board draws it like any photo.
 */

export const ICONS = [
  'Star', 'Heart', 'Award', 'Trophy', 'Medal', 'Crown', 'Briefcase', 'GraduationCap', 'BookOpen', 'Calendar',
  'CalendarCheck', 'Clock', 'MapPin', 'Phone', 'Mail', 'CircleCheck', 'BadgeCheck', 'Sparkles', 'PartyPopper', 'Megaphone',
  'Users', 'User', 'Building2', 'Flag', 'Gift', 'ThumbsUp', 'Smile', 'Sun', 'Moon', 'Zap',
  'Rocket', 'Target', 'Lightbulb', 'Pen', 'Coffee', 'Music', 'Camera', 'Globe', 'Leaf', 'Flower2',
  'Handshake', 'Laptop', 'Mic', 'Bell', 'Sparkle', 'ArrowRight', 'ArrowLeft', 'ChevronRight', 'Quote', 'Hash',
  'Info', 'Wifi', 'Building', 'Landmark', 'HeartHandshake', 'Stethoscope', 'Truck', 'ShoppingBag', 'Wrench', 'Code',
];

export const STICKERS = [
  'FcApproval', 'FcAlarmClock', 'FcBriefcase', 'FcCalendar', 'FcCollaboration', 'FcConferenceCall', 'FcIdea', 'FcLike',
  'FcRating', 'FcVip', 'FcBusinessman', 'FcBusinesswoman', 'FcCheckmark', 'FcGlobe', 'FcHome', 'FcPhone',
  'FcSms', 'FcAdvertising', 'FcAssistant', 'FcGraduationCap', 'FcReading', 'FcDiploma1', 'FcDiploma2', 'FcManager',
  'FcOrganization', 'FcPortraitMode', 'FcPlanner', 'FcStart', 'FcSportsMode', 'FcSmartphoneTablet', 'FcCamera', 'FcMusic',
  'FcGallery', 'FcInfo', 'FcFlashOn', 'FcCustomerSupport',
];

/** "GraduationCap" -> "Graduation cap", "FcDiploma1" -> "Diploma". */
export function iconLabel(name) {
  const words = name
    .replace(/^Fc(?=[A-Z])/, '')
    .replace(/\d+$/, '')
    .split(/(?=[A-Z])/)
    .map((word) => word.toLowerCase());
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The names whose label contains every word of `query` (case-insensitive); all of them for a blank query. */
export function filterIcons(names, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return names;
  return names.filter((name) => {
    const label = iconLabel(name).toLowerCase();
    return terms.every((term) => label.includes(term));
  });
}

/** A self-contained data: URL for SVG markup (UTF-8 safe). */
export function svgToDataUrl(svg) {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}
