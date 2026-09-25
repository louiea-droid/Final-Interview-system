/* Board size the gap labels are reported in - the live board is 1920x1080. */
const BOARD_PX = { x: 1920, y: 1080 };

export default function SmartGuides({ guides }) {
  return (
    <>
      {guides.lines.map((line) => (
        <div
          key={`${line.axis}-${line.at}`}
          className={`vb-smart-guide is-${line.axis}`}
          style={line.axis === 'x' ? { left: `${line.at}%` } : { top: `${line.at}%` }}
          aria-hidden="true"
        />
      ))}

      {guides.gaps.map((gap) => {
        const length = gap.to - gap.from;
        const style =
          gap.axis === 'x'
            ? { left: `${gap.from}%`, width: `${length}%`, top: `${gap.at}%` }
            : { top: `${gap.from}%`, height: `${length}%`, left: `${gap.at}%` };

        return (
          <div key={`${gap.axis}-${gap.from}`} className={`vb-gap is-${gap.axis}`} style={style} aria-hidden="true">
            <span>{Math.round((length / 100) * BOARD_PX[gap.axis])}</span>
          </div>
        );
      })}
    </>
  );
}
