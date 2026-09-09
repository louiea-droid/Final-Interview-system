import { Megaphone } from "lucide-react";

/*
 * The bordered announcement banner - shared between the live board
 * (VisualBoard.jsx) and the admin editor's canvas (AdminVisualBoard.jsx),
 * so the strip the admin drags around is the very one viewers see. It fills
 * the box it's given (width and height alike) rather than hugging its own
 * text, so resizing the box in the editor has a visible effect.
 *
 * `style` is the resolved announcement typography (see
 * announcementStyle.js); its font size is in cqh, measured against the
 * board the banner sits on. The <p> drops the browser's default margins so
 * the text is centred by the box alone.
 */
export default function AnnouncementBanner({
  message,
  style,
  lightMode = false,
  className = "",
}) {
  return (
    <div
      className={`
        flex
        h-full
        w-full
        items-center
        justify-center
        gap-2
        rounded-[2px]
        border
        border-[#c9a03c]
        px-[clamp(12px,2.4vw,22px)]
        py-[clamp(6px,1.2vw,12px)]
        text-center
        ${lightMode ? "bg-[#fdf6f3] text-[#7a5a12]" : "bg-[#2e0505] text-[#f0d689]"}
        ${className}
      `}
    >
      <Megaphone size={18} className="shrink-0" aria-hidden="true" />

      <p className="m-0 leading-snug" style={style}>
        {message}
      </p>
    </div>
  );
}
