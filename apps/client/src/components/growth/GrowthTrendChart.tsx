import { Canvas, Text, View } from '@tarojs/components';
import type { CanvasProps } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { GrowthMetric, GrowthTrendPoint } from '@runew/contracts';
import { LineChart, type LineSeriesOption } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  type GridComponentOption,
  type TooltipComponentOption,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import type { ComposeOption, EChartsType } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '@/components/feedback';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { GROWTH_METRICS, formatGrowthDate, formatGrowthValue } from './constants';
import styles from './Growth.module.scss';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

type GrowthChartOption = ComposeOption<
  LineSeriesOption | GridComponentOption | TooltipComponentOption
>;
type CanvasTouchEvent = Parameters<NonNullable<CanvasProps['onTouchStart']>>[0];
type MiniProgramCanvas = HTMLCanvasElement & { width: number; height: number };

let chartSequence = 0;

function nextChartId() {
  chartSequence += 1;
  return `runew-growth-chart-${chartSequence}`;
}

function tooltipHtml(metric: GrowthMetric, params: unknown) {
  const item = (Array.isArray(params) ? params[0] : params) as
    | { data?: [number, number] }
    | undefined;
  const value = item?.data;
  if (!value) return '';
  const definition = GROWTH_METRICS[metric];
  return `${formatGrowthDate(value[0], true)}<br/>${definition.shortLabel} ${formatGrowthValue(value[1])} ${definition.unit}`;
}

export function buildGrowthChartOption(
  metric: GrowthMetric,
  points: GrowthTrendPoint[],
): GrowthChartOption {
  const definition = GROWTH_METRICS[metric];
  return {
    animationDuration: 420,
    animationEasing: 'cubicOut',
    grid: { left: 12, right: 16, top: 24, bottom: 28, containLabel: true },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: 'rgba(74, 57, 47, 0.9)',
      borderWidth: 0,
      padding: [9, 12],
      textStyle: { color: '#fff', fontSize: 12, lineHeight: 18 },
      formatter: (params: unknown) => tooltipHtml(metric, params),
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: 'rgba(141, 125, 112, 0.24)' } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: '#8d7d70',
        fontSize: 11,
        hideOverlap: true,
        formatter: (value: number) => formatGrowthDate(value),
      },
    },
    yAxis: {
      type: 'value',
      scale: true,
      name: definition.unit,
      nameTextStyle: { color: '#8d7d70', fontSize: 11, padding: [0, 0, 0, 4] },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#8d7d70', fontSize: 11 },
      splitLine: { lineStyle: { color: 'rgba(141, 125, 112, 0.12)', type: 'dashed' } },
    },
    series: [
      {
        name: definition.shortLabel,
        type: 'line',
        data: points.map((point) => [point.recordedAt, point.value]),
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 8,
        smooth: 0.22,
        lineStyle: { width: 3, color: definition.color },
        itemStyle: {
          color: definition.color,
          borderColor: '#fffcf7',
          borderWidth: 2,
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${definition.color}36` },
              { offset: 1, color: `${definition.color}05` },
            ],
          },
        },
        emphasis: { focus: 'series', scale: 1.35 },
      },
    ],
  };
}

function h5Canvas(id: string) {
  const root = document.getElementById(id);
  if (root instanceof HTMLCanvasElement) return root;
  return root?.querySelector('canvas') ?? null;
}

function touchPoint(event: CanvasTouchEvent) {
  return event.touches[0] ?? event.changedTouches[0] ?? null;
}

export interface GrowthTrendChartProps {
  metric: GrowthMetric;
  points: GrowthTrendPoint[];
  onSelectRecord?: (recordId: string) => void;
}

export function GrowthTrendChart({
  metric,
  points,
  onSelectRecord,
}: GrowthTrendChartProps) {
  const [canvasId] = useState(nextChartId);
  const chartRef = useRef<EChartsType | null>(null);
  const option = useMemo(() => buildGrowthChartOption(metric, points), [metric, points]);

  useEffect(() => {
    if (points.length === 0) return;
    let cancelled = false;
    let removeResize: (() => void) | undefined;

    function mount(canvas: MiniProgramCanvas, width: number, height: number, pixelRatio = 1) {
      if (cancelled) return;
      chartRef.current?.dispose();
      const chart = echarts.init(canvas, undefined, {
        renderer: 'canvas',
        width,
        height,
        devicePixelRatio: pixelRatio,
      });
      chart.setOption(option);
      chartRef.current = chart;
    }

    if (Taro.getEnv() === Taro.ENV_TYPE.WEAPP) {
      Taro.nextTick(() => {
        Taro.createSelectorQuery()
          .select(`#${canvasId}`)
          .fields({ node: true, size: true })
          .exec((results) => {
            const result = results[0] as
              | { node?: MiniProgramCanvas; width?: number; height?: number }
              | undefined;
            if (!result?.node || !result.width || !result.height) return;
            const pixelRatio = Taro.getSystemInfoSync().pixelRatio ?? 1;
            result.node.width = result.width * pixelRatio;
            result.node.height = result.height * pixelRatio;
            mount(result.node, result.width, result.height, pixelRatio);
          });
      });
    } else {
      const canvas = h5Canvas(canvasId);
      if (canvas) {
        const width = canvas.clientWidth || 320;
        const height = canvas.clientHeight || 220;
        mount(canvas, width, height, window.devicePixelRatio || 1);
        const resize = () => chartRef.current?.resize();
        window.addEventListener('resize', resize);
        removeResize = () => window.removeEventListener('resize', resize);
      }
    }

    return () => {
      cancelled = true;
      removeResize?.();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [canvasId, metric, option, points.length]);

  function forwardTouch(eventName: 'mousedown' | 'mousemove' | 'mouseup', event: CanvasTouchEvent) {
    if (Taro.getEnv() !== Taro.ENV_TYPE.WEAPP) return;
    const point = touchPoint(event);
    const chart = chartRef.current;
    if (!point || !chart) return;
    const handler = chart.getZr().handler as unknown as {
      dispatch: (name: string, payload: { zrX: number; zrY: number }) => void;
    };
    handler.dispatch(eventName, { zrX: point.x, zrY: point.y });
  }

  const definition = GROWTH_METRICS[metric];

  if (points.length === 0) {
    return (
      <GlassSurface level="card" radius="card" className={styles.chartCard}>
        <EmptyState
          title={`还没有${definition.shortLabel}曲线`}
          description={`记下第一次${definition.shortLabel}后，真实变化会从这里慢慢长出来。`}
          actionLabel="记录成长"
          onAction={() => onSelectRecord?.('')}
        />
      </GlassSurface>
    );
  }

  return (
    <GlassSurface level="card" radius="card" className={styles.chartCard}>
      <View className={styles.chartHeading}>
        <View>
          <Text className={`text-section-title ${styles.chartTitle}`}>{definition.label}</Text>
          <Text className={styles.chartCaption}>轻触圆点查看日期和数值</Text>
        </View>
        <Text className={styles.chartUnit}>{definition.unit}</Text>
      </View>
      <Canvas
        id={canvasId}
        canvasId={canvasId}
        type="2d"
        className={styles.chartCanvas}
        disableScroll
        aria-label={`${definition.shortLabel}趋势图，共 ${points.length} 个数值`}
        onTouchStart={(event) => forwardTouch('mousedown', event)}
        onTouchMove={(event) => forwardTouch('mousemove', event)}
        onTouchEnd={(event) => forwardTouch('mouseup', event)}
        onTouchCancel={(event) => forwardTouch('mouseup', event)}
      />
      <View className={styles.numericList} role="list" aria-label={`${definition.shortLabel}数值列表`}>
        {points.map((point) => (
          <View
            key={point.recordId}
            className={styles.numericRow}
            role="listitem"
            onClick={() => onSelectRecord?.(point.recordId)}
          >
            <Text className={styles.numericDate}>{formatGrowthDate(point.recordedAt)}</Text>
            <Text className={styles.numericValue}>
              {formatGrowthValue(point.value)} {definition.unit}
            </Text>
          </View>
        ))}
      </View>
    </GlassSurface>
  );
}
