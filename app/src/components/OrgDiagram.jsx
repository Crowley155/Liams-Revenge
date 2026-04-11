import { useRef, useEffect } from 'react';
import * as d3 from 'd3';

const NODE_RADIUS = 28;

const NODES = [
  { id: 'usd232', label: 'USD 232\nSchool District', group: 'org', color: '#6c8aff' },
  { id: 'jcprd', label: 'JCPRD\nParks & Rec', group: 'org', color: '#ff6b6b' },
  { id: 'mize', label: 'Mize\nElementary', group: 'place', color: '#74c0fc' },
  { id: 'lease', label: 'Lease\n§8(d)', group: 'doc', color: '#ffb347' },
  { id: 'family', label: 'Crowley\nFamily', group: 'person', color: '#69db7c' },
  { id: 'board', label: 'Board\nPolicies', group: 'doc', color: '#ffb347' },
];

const LINKS = [
  { source: 'usd232', target: 'mize', label: 'owns property' },
  { source: 'usd232', target: 'lease', label: 'landlord' },
  { source: 'jcprd', target: 'lease', label: 'tenant (lessee)' },
  { source: 'jcprd', target: 'mize', label: 'operates on' },
  { source: 'lease', target: 'board', label: 'requires compliance' },
  { source: 'family', target: 'mize', label: 'child enrolled' },
  { source: 'family', target: 'jcprd', label: 'enrolled in OST' },
];

function curvedPath(sx, sy, tx, ty) {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const curvature = dist * 0.2;
  const mx = (sx + tx) / 2 - dy * curvature / dist;
  const my = (sy + ty) / 2 + dx * curvature / dist;

  const angle = Math.atan2(ty - my, tx - mx);
  const ex = tx - Math.cos(angle) * (NODE_RADIUS + 4);
  const ey = ty - Math.sin(angle) * (NODE_RADIUS + 4);

  return { path: `M${sx},${sy} Q${mx},${my} ${ex},${ey}`, mx, my };
}

export default function OrgDiagram() {
  const svgRef = useRef(null);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth || 700;
    const height = 340;
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const nodes = NODES.map((d) => ({ ...d }));
    const links = LINKS.map((d) => ({ ...d }));

    const sim = d3
      .forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.id).distance(140))
      .force('charge', d3.forceManyBody().strength(-550))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(50));

    const defs = svg.append('defs');

    defs
      .append('marker')
      .attr('id', 'org-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L10,0L0,4Z')
      .attr('fill', '#8b8fa4');

    const linkG = svg.append('g').selectAll('g').data(links).join('g');

    const linkPath = linkG
      .append('path')
      .attr('fill', 'none')
      .attr('stroke', '#4a4f6a')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '0')
      .attr('marker-end', 'url(#org-arrow)');

    const linkLabel = linkG
      .append('text')
      .text((d) => d.label)
      .attr('fill', '#a0a4b8')
      .attr('font-size', 9)
      .attr('font-weight', 500)
      .attr('text-anchor', 'middle')
      .attr('dy', -6);

    const nodeG = svg
      .append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .call(
        d3
          .drag()
          .on('start', (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    nodeG
      .append('circle')
      .attr('r', NODE_RADIUS)
      .attr('fill', (d) => d.color + '18')
      .attr('stroke', (d) => d.color)
      .attr('stroke-width', 1.5);

    nodeG.each(function (d) {
      const lines = d.label.split('\n');
      const g = d3.select(this);
      lines.forEach((line, i) => {
        g.append('text')
          .text(line)
          .attr('fill', d.color)
          .attr('font-size', 10)
          .attr('font-weight', i === 0 ? 700 : 400)
          .attr('text-anchor', 'middle')
          .attr('dy', i === 0 ? (lines.length > 1 ? -4 : 4) : 10);
      });
    });

    sim.on('tick', () => {
      nodes.forEach((d) => {
        d.x = Math.max(45, Math.min(width - 45, d.x));
        d.y = Math.max(45, Math.min(height - 45, d.y));
      });

      linkPath.attr('d', (d) => {
        const { path } = curvedPath(d.source.x, d.source.y, d.target.x, d.target.y);
        return path;
      });

      linkLabel
        .attr('x', (d) => {
          const { mx } = curvedPath(d.source.x, d.source.y, d.target.x, d.target.y);
          return mx;
        })
        .attr('y', (d) => {
          const { my } = curvedPath(d.source.x, d.source.y, d.target.x, d.target.y);
          return my;
        });

      nodeG.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    return () => sim.stop();
  }, []);

  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-text-dim mb-2">
        Organizational Relationships
      </h3>
      <p className="text-[10px] text-text-dim mb-3">Arrows show the direction of the relationship. Drag nodes to rearrange.</p>
      <svg ref={svgRef} className="w-full" style={{ height: 340 }} />
    </div>
  );
}
