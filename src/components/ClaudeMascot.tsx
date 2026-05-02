/**
 * Pixel-art SVG che morpha tra claude (occhi normali) e claude-pirata
 * (sopracciglio + occhio a fessura, benda con teschio, baffi, bocca aperta).
 *
 * Body, braccine, gambine identici nei due frame. Cambia solo la faccia.
 *
 *  B body (orange)            P patch (black)
 *  D body shadow              K skull (white)
 *  A arm                      X skull eye-hole / bone-cross (dark)
 *  L leg                      e eyebrow (black, angled)
 *  E claude eye (dark)        s slit / closed eye (black)
 *                             M mustache (black)
 *                             R red lips
 *                             T teeth (white)
 */

const CLAUDE: string[] = [
  '    BBBBBBBB    ',
  '   BBBBBBBBBB   ',
  '  BBBBBBBBBBBB  ',
  '  BBBBBBBBBBBB  ',
  '  BBEEBBBBEEBB  ',
  '  BBBBBBBBBBBB  ',
  '  BBBBBBBBBBBB  ',
  ' ABBBBBBBBBBBBA ',
  '  BBBBBBBBBBBB  ',
  '  BBBBBBBBBBBB  ',
  '  DDBBBBBBBBDD  ',
  '  D          D  ',
  '   LL      LL   ',
  '   LL      LL   ',
];

const PIRATE: string[] = [
  '    BBBBBBBB    ',  //  0  body top (same)
  '   BBBeBBBBBB   ',  //  1  eyebrow TIP (angled up-right above main bar)
  '  BeeeeBPPPPPB  ',  //  2  eyebrow main bar (4 wide) + patch top
  '  BBBBBBPKKKPB  ',  //  3  skull top
  '  BBssBBPXKXPB  ',  //  4  closed eye slit + skull eye-holes
  '  BBBBBBPKKKPB  ',  //  5  skull bottom
  '  BBBBBBPPPPPB  ',  //  6  patch bottom
  ' ABBMMMMMMMMBBA ',  //  7  arms + mustache (8 wide)
  '  BMMMMMMMMMMB  ',  //  8  mustache wider (10 wide, bushy)
  '  BBRRTTTTRRBB  ',  //  9  open mouth: lips + 4 teeth
  '  DDBBBBBBBBDD  ',  // 10  shadow (same)
  '  D          D  ',  // 11
  '   LL      LL   ',  // 12  legs (same)
  '   LL      LL   ',  // 13
];

const PX = 6;
const W = CLAUDE[0].length * PX;
const H = CLAUDE.length * PX;

type Cell = { x: number; y: number; kind: string };

function gridCells(grid: string[]): Cell[] {
  const out: Cell[] = [];
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== ' ') out.push({ x, y, kind: row[x] });
    }
  }
  return out;
}

function fillFor(kind: string): string {
  switch (kind) {
    case 'B': return 'var(--accent)';   // body orange
    case 'A': return '#D87A1A';          // arm
    case 'D': return '#A85410';          // shadow
    case 'L': return '#A85410';          // leg
    case 'E': return '#1E1F1A';          // claude eye
    case 'e': return '#1E1F1A';          // pirate eyebrow
    case 's': return '#1E1F1A';          // pirate slit/closed eye
    case 'P': return '#1E1F1A';          // eye patch (black)
    case 'K': return '#F8F8F2';          // skull (white)
    case 'X': return '#1E1F1A';          // skull eye-hole
    case 'M': return '#1E1F1A';          // mustache
    case 'R': return '#C13651';          // red lip
    case 'T': return '#F8F8F2';          // teeth
    default:  return 'transparent';
  }
}

export function ClaudeMascot({ size = 140 }: { size?: number }) {
  const claudeCells = gridCells(CLAUDE);
  const pirateCells = gridCells(PIRATE);

  return (
    <svg
      className="mascot"
      width={size}
      height={size * (H / W)}
      viewBox={`0 0 ${W} ${H}`}
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g className="mascot__frame mascot__frame--claude">
        {claudeCells.map(({ x, y, kind }) => (
          <rect
            key={`c-${x}-${y}`}
            className={kind === 'E' ? 'mascot__eye' : ''}
            x={x * PX}
            y={y * PX}
            width={PX}
            height={PX}
            fill={fillFor(kind)}
          />
        ))}
      </g>

      <g className="mascot__frame mascot__frame--pirate">
        {pirateCells.map(({ x, y, kind }) => (
          <rect
            key={`p-${x}-${y}`}
            x={x * PX}
            y={y * PX}
            width={PX}
            height={PX}
            fill={fillFor(kind)}
          />
        ))}
      </g>
    </svg>
  );
}
