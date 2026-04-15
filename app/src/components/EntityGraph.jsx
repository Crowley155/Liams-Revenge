import { useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as d3 from 'd3';
import { fetchEntityGraph } from '../api/client';

const TYPE_COLORS = {
  district: '#6c8aff',
  department: '#ff6b6b',
  board: '#69db7c',
  agency: '#ffa94d',
  program: '#cc5de8',
  commission: '#20c997',
  county: '#339af0',
};

const REL_COLORS = {
  oversees: '#6c8aff',
  leases_to: '#ffa94d',
  funds: '#69db7c',
  regulates: '#ff6b6b',
  parent_of: '#cc5de8',
  contracts_with: '#339af0',
};

export default function EntityGraph({ entityId }) {
  const svgRef = useRef(null);
  const navigate = useNavigate();
  const [graphData, setGraphData] = useState(null);
  const [error, setError] = useState(null);
  const simulationRef = useRef(null);

  useEffect(() => {
    fetchEntityGraph()
      .then(setGraphData)
      .catch((e) => setError(e.message));
  }, []);

  const renderGraph = useCallback(() => {
    if (!graphData || !svgRef.current) return;

    const container = svgRef.current.parentElement;
    const width = container.clientWidth;
    const height = container.clientHeight || 500;

    const svg = d3.select(svgRef.current);
    svg.on('.zoom', null);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const { nodes: rawNodes, edges: rawEdges } = graphData;
    if (!rawNodes.length) return;

    const nodeMap = new Map(rawNodes.map((n) => [n.id, n]));

    const nodes = rawNodes.map((n) => ({
      ...n,
      isFocus: n.id === entityId,
    }));
    const links = rawEdges
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map((e) => ({ ...e }));

    svg.append('defs')
      .append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 28)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#4a4f6a');

    const g = svg.append('g');

    const zoom = d3.zoom()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.id).distance(150))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(40));

    simulationRef.current = simulation;

    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (d) => REL_COLORS[d.relationship_type] || '#4a4f6a')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', 'url(#arrowhead)');

    const linkLabel = g.append('g')
      .selectAll('text')
      .data(links)
      .join('text')
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .attr('fill', '#8b8fa4')
      .text((d) => d.relationship_type?.replace(/_/g, ' ') || '');

    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }),
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        navigate(`/entities/${d.id}`);
      });

    node.append('circle')
      .attr('r', (d) => d.isFocus ? 24 : 18)
      .attr('fill', (d) => {
        const color = TYPE_COLORS[d.type] || '#6c8aff';
        return color + (d.isFocus ? '40' : '22');
      })
      .attr('stroke', (d) => TYPE_COLORS[d.type] || '#6c8aff')
      .attr('stroke-width', (d) => d.isFocus ? 2.5 : 1.5);

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.2em')
      .attr('font-size', (d) => d.isFocus ? '10px' : '8px')
      .attr('font-weight', (d) => d.isFocus ? 'bold' : 'normal')
      .attr('fill', (d) => TYPE_COLORS[d.type] || '#6c8aff')
      .text((d) => {
        const name = d.name || d.id;
        return name.length > 14 ? name.slice(0, 13) + '…' : name;
      });

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.1em')
      .attr('font-size', '7px')
      .attr('fill', '#8b8fa4')
      .text((d) => {
        const parts = [];
        if (d.member_count) parts.push(`${d.member_count}m`);
        if (d.fact_count) parts.push(`${d.fact_count}f`);
        return parts.join(' · ') || d.type;
      });

    node.append('title')
      .text((d) => `${d.name}\n${d.type} | ${d.state}\n${d.member_count || 0} members | ${d.fact_count || 0} facts`);

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);

      linkLabel
        .attr('x', (d) => (d.source.x + d.target.x) / 2)
        .attr('y', (d) => (d.source.y + d.target.y) / 2 - 6);

      node.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    return () => simulation.stop();
  }, [graphData, entityId, navigate]);

  useEffect(() => {
    renderGraph();
    return () => {
      if (simulationRef.current) simulationRef.current.stop();
    };
  }, [renderGraph]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-danger">
        Failed to load graph: {error}
      </div>
    );
  }

  if (!graphData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!graphData.nodes?.length) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-text-dim">
        No entities to display. Create some entities and research them to see the graph.
      </div>
    );
  }

  return <svg ref={svgRef} className="w-full h-full" />;
}
