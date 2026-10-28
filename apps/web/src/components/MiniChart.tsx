import * as echarts from "echarts";
import { useEffect, useRef } from "react";

const PALETTE = ["#1F8A4C", "#3B82F6", "#F59E0B", "#7C3AED", "#0E9384", "#C11574"];

export interface MiniDatum {
  label: string;
  value: number;
  color?: string;
}

/**
 * 轻量图表：用于指标卡旁的小结构图（环形 / 竖条 / 横条）。
 * 与 TrendChart 分离，避免为了一个小图塞进整套折线配置。
 */
export function MiniChart({
  kind,
  data,
  height = 160,
}: {
  kind: "donut" | "bar" | "hbar";
  data: MiniDatum[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const signature = JSON.stringify({ kind, data, height });

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const color = data.map((item, index) => item.color ?? PALETTE[index % PALETTE.length]);

    if (kind === "donut") {
      chart.setOption({
        color,
        tooltip: { trigger: "item", formatter: "{b}：{c}（{d}%）" },
        legend: {
          orient: "vertical",
          right: 0,
          top: "middle",
          itemWidth: 8,
          itemHeight: 8,
          textStyle: { fontSize: 12, color: "#475467" },
        },
        series: [
          {
            type: "pie",
            radius: ["52%", "76%"],
            center: ["34%", "50%"],
            avoidLabelOverlap: true,
            itemStyle: { borderColor: "#fff", borderWidth: 2 },
            label: { show: false },
            data: data.map((item) => ({ name: item.label, value: item.value })),
          },
        ],
      });
    } else {
      const horizontal = kind === "hbar";
      chart.setOption({
        color,
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
        grid: { left: horizontal ? 96 : 8, right: 16, top: 8, bottom: 8, containLabel: !horizontal },
        xAxis: horizontal
          ? { type: "value", axisLabel: { fontSize: 11, color: "#98A2B3" }, splitLine: { lineStyle: { color: "#F2F4F7" } } }
          : {
              type: "category",
              data: data.map((item) => item.label),
              axisLabel: { fontSize: 11, color: "#667085", interval: 0 },
              axisTick: { show: false },
              axisLine: { lineStyle: { color: "#EAECF0" } },
            },
        yAxis: horizontal
          ? {
              type: "category",
              data: data.map((item) => item.label),
              axisLabel: { fontSize: 11, color: "#667085" },
              axisTick: { show: false },
              axisLine: { lineStyle: { color: "#EAECF0" } },
            }
          : { type: "value", axisLabel: { fontSize: 11, color: "#98A2B3" }, splitLine: { lineStyle: { color: "#F2F4F7" } } },
        series: [
          {
            type: "bar",
            barMaxWidth: 18,
            itemStyle: { borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] },
            data: data.map((item, index) => ({
              value: item.value,
              itemStyle: { color: item.color ?? PALETTE[index % PALETTE.length] },
            })),
          },
        ],
      });
    }

    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [signature, kind, data, height]);

  return <div ref={ref} style={{ height, width: "100%" }} />;
}
