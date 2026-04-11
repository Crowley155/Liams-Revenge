import { useRef, useEffect, useState, useCallback } from 'react';
import * as d3 from 'd3';

const R = 28;
const HEIGHT = 560;
const PAD = { top: 50, bottom: 40, x: 30 };

const TIER_Y = [0.10, 0.48, 0.90];

const NODES = [
  // Tier 0 — State
  { id: 'ksbe', label: 'KSBE', tier: 0, color: '#74c0fc', group: 'governance',
    tooltip: 'Kansas State Board of Education. Accredits USD 232 under K.S.A. 72-5170. District 4 member Connie O\'Brien represents USD 232\'s area.' },
  { id: 'kdhe', label: 'KDHE', tier: 0, color: '#e599f7', group: 'regulatory',
    tooltip: 'Kansas Dept. of Health and Environment. Licenses JCPRD\'s childcare program. Can inspect on complaint (65-512), suspend licenses (65-524), and fine $500/day/violation (65-526). Also binds USD 232 via 72-1421(c).' },
  { id: 'dcf', label: 'Kansas DCF', tier: 0, color: '#ffa94d', group: 'regulatory',
    tooltip: 'Kansas Dept. for Children and Families. Received mandatory reporter filing from pediatrician after the assault. Investigates child abuse/neglect under K.S.A. 38-2226.' },
  // Tier 1 — Local
  { id: 'usd232', label: 'USD 232', tier: 1, color: '#6c8aff', group: 'org',
    tooltip: 'De Soto Unified School District 232. Owns Mize Elementary. Landlord in the JCPRD lease. Lease §8(d) requires JCPRD to follow all board policies. §7(c) gives the district enforcement authority.' },
  { id: 'jcprd', label: 'JCPRD', tier: 1, color: '#ff6b6b', group: 'org',
    tooltip: 'Johnson County Park and Recreation District. Operates the Out-of-School-Time program at Mize. KDHE-licensed childcare facility. Five staff were outside during the assault; none witnessed it.' },
  { id: 'jccl', label: 'JCCL', tier: 1, color: '#e599f7', group: 'regulatory',
    tooltip: 'Johnson County Child Care Licensing. KDHE\'s local surveyor — conducts inspections in Johnson County under an "Aid to Local" contract. JCPRD\'s own staff told the parent "making a report to JCCL is always an option."' },
  { id: 'jcda', label: 'JC Dist. Atty', tier: 1, color: '#ff8787', group: 'enforcement',
    tooltip: 'Johnson County District Attorney. K.S.A. 65-515 makes the county attorney "authorized and required" to prosecute Article 5 childcare violations upon KDHE complaint. Not discretionary.' },
  // Tier 2 — Ground
  { id: 'mize', label: 'Mize Elem.', tier: 2, color: '#74c0fc', group: 'place',
    tooltip: 'Mize Elementary School, Shawnee, KS. USD 232 property where JCPRD operates its OST program. Site of the April 2, 2026 assault.' },
  { id: 'family', label: 'Crowley Family', tier: 2, color: '#69db7c', group: 'person',
    tooltip: 'The affected family. Filed police report (Shawnee PD #2601522), DCF complaint, JCCL complaint, and formal grievances with both USD 232 and JCPRD.' },
];

const LINKS = [
  { source: 'ksbe', target: 'usd232', label: 'accredits (72-5170)' },
  { source: 'kdhe', target: 'jcprd', label: 'licenses (65-504)' },
  { source: 'kdhe', target: 'usd232', label: 'binds via 72-1421(c)' },
  { source: 'kdhe', target: 'jccl', label: 'delegates inspections' },
  { source: 'kdhe', target: 'jcda', label: 'triggers prosecution (65-515)' },
  { source: 'dcf', target: 'jcprd', label: 'investigates (38-2226)' },
  { source: 'jccl', target: 'jcprd', label: 'inspects (65-512)' },
  { source: 'jcda', target: 'jcprd', label: 'prosecutes (65-514)' },
  { source: 'usd232', target: 'jcprd', label: 'Lease §8(d)/§7(c)' },
  { source: 'usd232', target: 'mize', label: 'owns property' },
  { source: 'jcprd', target: 'mize', label: 'operates on' },
  { source: 'family', target: 'jcprd', label: 'enrolled in OST' },
  { source: 'family', target: 'dcf', label: 'mandatory report filed' },
];


function curvedPath(sx, sy, tx, ty) {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const curvature = dist * 0.15;
  const mx = (sx + tx) / 2 - (dy * curvature) / dist;
  const my = (sy + ty) / 2 + (dx * curvature) / dist;
  const angle = Math.atan2(ty - my, tx - mx);
  const ex = tx - Math.cos(angle) * (R + 4);
  const ey = ty - Math.sin(angle) * (R + 4);
  return { path: `M${sx},${sy} Q${mx},${my} ${ex},${ey}`, mx, my };
}

function initialPositions(width) {
  const tiers = [[], [], []];
  NODES.forEach((n) => tiers[n.tier].push(n.id));

  const pos = {};
  tiers.forEach((ids, ti) => {
    const count = ids.length;
    const usable = width - PAD.x * 2;
    const spacing = usable / (count + 1);
    ids.forEach((id, i) => {
      pos[id] = { x: PAD.x + spacing * (i + 1), y: TIER_Y[ti] * HEIGHT };
    });
  });
  return pos;
}

export default function OrgDiagram() {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const simRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const onMouseMove = useCallback((e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const draw = () => {
      const svg = d3.select(svgRef.current);
      svg.selectAll('*').remove();

      const width = el.clientWidth || 700;
      svg.attr('viewBox', `0 0 ${width} ${HEIGHT}`);

      const initPos = initialPositions(width);
      const nodes = NODES.map((d) => ({ ...d, x: initPos[d.id].x, y: initPos[d.id].y }));
      const links = LINKS.map((d) => ({ ...d }));

      const tierTargets = {};
      NODES.forEach((n) => { tierTargets[n.id] = TIER_Y[n.tier] * HEIGHT; });

      const sim = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id((d) => d.id).distance(180).strength(0.25))
        .force('charge', d3.forceManyBody().strength(-900))
        .force('collision', d3.forceCollide(R + 30))
        .force('tierY', d3.forceY((d) => tierTargets[d.id]).strength(0.4))
        .alphaDecay(0.02)
        .stop();

      // Pre-settle so nodes don't animate on load
      for (let i = 0; i < 300; i++) sim.tick();

      simRef.current = sim;

      // Arrow marker
      const defs = svg.append('defs');
      defs.append('marker')
        .attr('id', 'org-arrow')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 8).attr('refY', 0)
        .attr('markerWidth', 7).attr('markerHeight', 7)
        .attr('orient', 'auto')
        .append('path').attr('d', 'M0,-4L10,0L0,4Z').attr('fill', '#8b8fa4');

      // Links group
      const linkG = svg.append('g').selectAll('g').data(links).join('g');

      const linkPath = linkG.append('path')
        .attr('fill', 'none')
        .attr('stroke', '#4a4f6a')
        .attr('stroke-width', 1.2)
        .attr('marker-end', 'url(#org-arrow)');

      const linkLabel = linkG.append('text')
        .text((d) => d.label)
        .attr('fill', '#9094ad')
        .attr('font-size', 8)
        .attr('font-weight', 500)
        .attr('text-anchor', 'middle')
        .attr('dy', -4)
        .attr('stroke', '#1a1b2e')
        .attr('stroke-width', 3)
        .attr('paint-order', 'stroke');

      // Nodes group
      const nodeG = svg.append('g').selectAll('g').data(nodes).join('g')
        .style('cursor', 'grab')
        .call(
          d3.drag()
            .on('start', (event, d) => {
              if (!event.active) sim.alphaTarget(0.3).restart();
              d.fx = d.x; d.fy = d.y;
            })
            .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
            .on('end', (event, d) => {
              if (!event.active) sim.alphaTarget(0);
              d.fx = null; d.fy = null;
            })
        );

      nodeG.append('circle')
        .attr('r', R)
        .attr('fill', (d) => d.color + '18')
        .attr('stroke', (d) => d.color)
        .attr('stroke-width', 1.5);

      nodeG.append('text')
        .text((d) => d.label)
        .attr('fill', (d) => d.color)
        .attr('font-size', (d) => d.label.length > 10 ? 8 : 9.5)
        .attr('font-weight', 700)
        .attr('text-anchor', 'middle')
        .attr('dy', 4);

      // Hover events
      nodeG
        .on('mouseenter', (_, d) => setTooltip(d))
        .on('mouseleave', () => setTooltip(null));

      function render() {
        nodes.forEach((d) => {
          d.x = Math.max(R + 4, Math.min(width - R - 4, d.x));
          d.y = Math.max(R + 4, Math.min(HEIGHT - R - 4, d.y));
        });

        linkPath.attr('d', (d) => curvedPath(d.source.x, d.source.y, d.target.x, d.target.y).path);

        linkLabel
          .attr('x', (d) => curvedPath(d.source.x, d.source.y, d.target.x, d.target.y).mx)
          .attr('y', (d) => curvedPath(d.source.x, d.source.y, d.target.x, d.target.y).my);

        nodeG.attr('transform', (d) => `translate(${d.x},${d.y})`);
      }

      render();
      sim.on('tick', render);
    };

    draw();

    const ro = new ResizeObserver(() => {
      if (simRef.current) simRef.current.stop();
      draw();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      if (simRef.current) simRef.current.stop();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="bg-surface border border-border rounded-lg p-4 relative"
      onMouseMove={onMouseMove}
    >
      <h3 className="text-xs font-bold uppercase tracking-wide text-text-dim mb-2">
        Organizational &amp; Regulatory Relationships
      </h3>
      <p className="text-[10px] text-text-dim mb-1">
        Hover over any entity for details. Drag nodes to rearrange.
      </p>
      <div className="flex gap-3 flex-wrap mb-3">
        <Legend color="#74c0fc" label="Governance" />
        <Legend color="#6c8aff" label="Parties" />
        <Legend color="#e599f7" label="Regulatory" />
        <Legend color="#ffa94d" label="Child protection" />
        <Legend color="#ff8787" label="Enforcement" />
        <Legend color="#69db7c" label="Family" />
      </div>
      <svg ref={svgRef} className="w-full" style={{ height: HEIGHT }} />

      {tooltip && (
        <div
          className="absolute z-20 pointer-events-none max-w-xs bg-bg border border-border rounded-lg px-3 py-2 shadow-xl"
          style={{
            left: Math.min(mousePos.x + 14, (containerRef.current?.clientWidth || 400) - 280),
            top: mousePos.y + 14,
          }}
        >
          <p className="text-xs font-bold mb-1" style={{ color: tooltip.color }}>
            {tooltip.label}
          </p>
          <p className="text-[11px] text-text-dim leading-relaxed">{tooltip.tooltip}</p>
        </div>
      )}
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-text-dim">
      <span
        className="inline-block w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: color + '44', border: `1.5px solid ${color}` }}
      />
      {label}
    </span>
  );
}
