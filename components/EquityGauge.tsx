import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface EquityGaugeProps {
  value: number; // 0 to 100
  label?: string;
}

const EquityGauge: React.FC<EquityGaugeProps> = ({ value, label = "Equity %" }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 180;
    const height = 120;
    const radius = Math.min(width, height) - 10;
    const svg = d3.select(svgRef.current);
    
    svg.selectAll("*").remove(); // Clear previous

    const g = svg
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${width / 2},${height - 10})`);

    // Define scale
    const scale = d3.scaleLinear().domain([0, 100]).range([-Math.PI / 2, Math.PI / 2]);

    // Define Arc
    const arc = d3.arc<any>()
      .innerRadius(radius - 20)
      .outerRadius(radius)
      .startAngle(-Math.PI / 2);

    // Background Arc
    g.append("path")
      .datum({ endAngle: Math.PI / 2 })
      .style("fill", "#e2e8f0")
      .attr("d", arc);

    // Foreground Arc (Animated)
    const foreground = g.append("path")
      .datum({ endAngle: -Math.PI / 2 })
      .style("fill", value >= 25 ? "#10b981" : value >= 10 ? "#f59e0b" : "#ef4444")
      .attr("d", arc);

    foreground.transition()
      .duration(1000)
      .attrTween("d", function(d) {
        const i = d3.interpolate(d.endAngle, scale(Math.max(0, Math.min(100, value))));
        return function(t) {
          d.endAngle = i(t);
          return arc(d) || "";
        };
      });

    // Text
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("y", -10)
      .attr("class", "text-2xl font-bold fill-slate-700")
      .text(`${value.toFixed(0)}%`);

    g.append("text")
      .attr("text-anchor", "middle")
      .attr("y", 15)
      .attr("class", "text-xs fill-slate-500 uppercase tracking-wider")
      .text(label);

  }, [value, label]);

  return <svg ref={svgRef}></svg>;
};

export default EquityGauge;