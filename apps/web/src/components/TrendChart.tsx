import * as echarts from "echarts";
import { useEffect, useRef } from "react";

export interface TrendSeries {
  name: string;
  data: (number | null)[];
  type?: "bar" | "line";
  axis?: 0 | 1;
}

export function TrendChart({
  labels,
  series,
  height = 280,
}: {
  labels: string[];
  series: TrendSeries[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const signature = JSON.stringify({ labels, series, height });

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const dual = series.some((item) => item.axis === 1);
    chart.setOption({
      color: ["#1F8A4C", "#3B82F6", "#F59E0B"],
      tooltip: { trigger: "axis", valueFormatter: (value: unknown) => (value == null ? "暂无数据" : String(value)) },
      legend: { type: "scroll", top: 0 },
      grid: { left: 56, right: dual ? 64 : 16, top: 36, bottom: 28 },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { formatter: (value: string) => value.slice(5) },
      },
      yAxis: dual
        ? [
            { type: "value", scale: true, name: "数量" },
            { type: "value", scale: true, name: "美元", splitLine: { show: false } },
          ]
        : [{ type: "value", scale: true }],
      series: series.map((item) => ({
        name: item.name,
        type: item.type ?? "line",
        yAxisIndex: item.axis ?? 0,
        showSymbol: false,
        connectNulls: false,
        barMaxWidth: 18,
        data: item.data,
      })),
    });
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [signature, labels, series, height]);

  return <div ref={ref} style={{ height }} />;
}