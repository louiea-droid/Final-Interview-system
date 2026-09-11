import { fillBoxCss } from "../lib/fill";

/*
 * The bordered announcement banner - shared between the live board
 * (VisualBoard.jsx) and the admin editor's canvas (AdminVisualBoard.jsx),
 * so the strip the admin drags around is the very one viewers see. It fills
 * the box it's given (width and height alike) rather than hugging its own
 * text, so resizing the box in the editor has a visible effect.
 *
 * `style` is the resolved message typography (see announcementStyle.js);
 * its font size is in cqh, measured against the board the banner sits on.
 * The <p> drops the browser's default margins so the text is centred by
 * the box alone. `showIcon`/`icon`/`background` are that same style's own
 * fields, passed separately since they apply to the banner itself rather
 * than the message text.
 */
export default function AnnouncementBanner({
  message,
  style,
  showIcon = true,
  icon = "📢",
  background,
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
        ${className}
      `}
      style={fillBoxCss(background)}
    >
      {showIcon && (
        <span className="shrink-0 text-[1.3em] leading-none" aria-hidden="true">
          {icon}
        </span>
      )}

      <p className="m-0 leading-snug" style={style}>
        {message}
      </p>
    </div>
  );
}
