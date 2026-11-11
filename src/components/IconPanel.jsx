import { useState } from 'react';
import { Search } from 'lucide-react';
import {
  Star, Heart, Award, Trophy, Medal, Crown, Briefcase, GraduationCap, BookOpen, Calendar,
  CalendarCheck, Clock, MapPin, Phone, Mail, CircleCheck, BadgeCheck, Sparkles, PartyPopper,
  Megaphone, Users, User, Building2, Flag, Gift, ThumbsUp, Smile, Sun, Moon, Zap, Rocket, Target,
  Lightbulb, Pen, Coffee, Music, Camera, Globe, Leaf, Flower2, Handshake, Laptop, Mic, Bell,
  Sparkle, ArrowRight, ArrowLeft, ChevronRight, Quote, Hash, Info, Wifi, Building, Landmark,
  HeartHandshake, Stethoscope, Truck, ShoppingBag, Wrench, Code,
} from 'lucide-react';
import {
  FcApproval, FcAlarmClock, FcBriefcase, FcCalendar, FcCollaboration, FcConferenceCall, FcIdea,
  FcLike, FcRating, FcVip, FcBusinessman, FcBusinesswoman, FcCheckmark, FcGlobe, FcHome, FcPhone,
  FcSms, FcAdvertising, FcAssistant, FcGraduationCap, FcReading, FcDiploma1, FcDiploma2,
  FcManager, FcOrganization, FcPortraitMode, FcPlanner, FcStart, FcSportsMode, FcSmartphoneTablet,
  FcCamera, FcMusic, FcGallery, FcInfo, FcFlashOn, FcCustomerSupport,
} from 'react-icons/fc';

import { ICONS, STICKERS, filterIcons, iconLabel, svgToDataUrl } from '../lib/iconCatalog';

/* Imported by name (not the whole libraries), so the bundle only carries these. */
const ICON_COMPONENTS = { Star, Heart, Award, Trophy, Medal, Crown, Briefcase, GraduationCap, BookOpen, Calendar, CalendarCheck, Clock, MapPin, Phone, Mail, CircleCheck, BadgeCheck, Sparkles, PartyPopper, Megaphone, Users, User, Building2, Flag, Gift, ThumbsUp, Smile, Sun, Moon, Zap, Rocket, Target, Lightbulb, Pen, Coffee, Music, Camera, Globe, Leaf, Flower2, Handshake, Laptop, Mic, Bell, Sparkle, ArrowRight, ArrowLeft, ChevronRight, Quote, Hash, Info, Wifi, Building, Landmark, HeartHandshake, Stethoscope, Truck, ShoppingBag, Wrench, Code };
const STICKER_COMPONENTS = { FcApproval, FcAlarmClock, FcBriefcase, FcCalendar, FcCollaboration, FcConferenceCall, FcIdea, FcLike, FcRating, FcVip, FcBusinessman, FcBusinesswoman, FcCheckmark, FcGlobe, FcHome, FcPhone, FcSms, FcAdvertising, FcAssistant, FcGraduationCap, FcReading, FcDiploma1, FcDiploma2, FcManager, FcOrganization, FcPortraitMode, FcPlanner, FcStart, FcSportsMode, FcSmartphoneTablet, FcCamera, FcMusic, FcGallery, FcInfo, FcFlashOn, FcCustomerSupport };

/*
 * The button's own rendered <svg>, made self-contained at 512px: line icons
 * take the chosen colour (they draw with currentColor); stickers keep theirs.
 */
function svgFrom(button, color) {
  const svg = button.querySelector('svg').cloneNode(true);
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', '512');
  svg.setAttribute('height', '512');
  svg.removeAttribute('class');
  let markup = new XMLSerializer().serializeToString(svg);
  if (color) markup = markup.replaceAll('currentColor', color);
  return markup;
}

/* The Icons rail tab: a search, a colour for line icons, and two grids. */
export default function IconPanel({ onInsert }) {
  const [query, setQuery] = useState('');
  const [color, setColor] = useState('#f4ca5d');
  const icons = filterIcons(ICONS, query);
  const stickers = filterIcons(STICKERS, query);

  function insert(event, tint) {
    onInsert(svgToDataUrl(svgFrom(event.currentTarget, tint)));
  }

  return (
    <div className="vb-icon-panel">
      <div className="vb-icon-top">
        <label className="vb-icon-search">
          <Search size={13} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search icons and stickers"
          />
        </label>
      </div>

      <section className="vb-icon-section">
        <header className="vb-icon-head">
          <h3>
            Icons <span>{icons.length}</span>
          </h3>
          <label className="vb-icon-color" title="Colour for new icons">
            <span>Colour</span>
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="Icon colour" />
          </label>
        </header>
        <div className="vb-icon-grid">
          {icons.map((name) => {
            const Icon = ICON_COMPONENTS[name];
            return (
              <button key={name} type="button" title={iconLabel(name)} aria-label={`Add ${iconLabel(name)} icon`} onClick={(event) => insert(event, color)}>
                <Icon size={18} color={color} strokeWidth={1.75} />
              </button>
            );
          })}
        </div>
      </section>

      <section className="vb-icon-section">
        <header className="vb-icon-head">
          <h3>
            Stickers <span>{stickers.length}</span>
          </h3>
        </header>
        <div className="vb-icon-grid">
          {stickers.map((name) => {
            const Sticker = STICKER_COMPONENTS[name];
            return (
              <button key={name} type="button" title={iconLabel(name)} aria-label={`Add ${iconLabel(name)} sticker`} onClick={(event) => insert(event, null)}>
                <Sticker size={22} />
              </button>
            );
          })}
        </div>
      </section>

      {!icons.length && !stickers.length && <p className="vb-properties-hint">Nothing matches “{query}”.</p>}
      <p className="vb-icon-tip">Click one to add it to the board.</p>
    </div>
  );
}
