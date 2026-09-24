import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Send,
  Paperclip,
  Mic,
  MicOff,
  RotateCcw,
  Sparkles,
  Bot,
  User,
  X,
  FileText,
  FileSpreadsheet,
  File,
  Download,
  Maximize2,
  Minimize2,
  BarChart2,
  PieChart as PieIcon,
  TrendingUp,
  Eye,
  Layers,
  CheckCircle2,
  AlertCircle,
  Clock,
  Shield,
  Search,
  ExternalLink,
  ChevronDown,
  Plus,
  Trash2,
  Copy,
  Check,
  MessageSquare,
  MapPin,
  RefreshCw,
  Square
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
} from 'recharts';

export interface AiChatSession {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiChatSinauProps {
  isOpen?: boolean;
  isFullPage?: boolean;
  onClose?: () => void;
  activeMenu?: string;
  activeFilters?: {
    category?: string;
    status?: string;
    search?: string;
    province?: string;
  };
  selectedAsset?: any;
  currentUser?: any;
  activeRole?: string;
  pageContext?: 'welcome' | 'portal' | 'app';
}

interface ChatMessage {
  id: string;
  sessionId?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachments?: Array<{ name: string; type: string; size: number }>;
}

const DEFAULT_CHART_COLORS = [
  '#0d9488', // Sinau Teal
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Rose
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#64748b', // Slate
];

// Helper to format currency
function formatRupiah(val: number): string {
  if (!val && val !== 0) return '-';
  return 'Rp ' + Number(val).toLocaleString('id-ID');
}

function formatNumber(val: number): string {
  if (!val && val !== 0) return '0';
  return Number(val).toLocaleString('id-ID');
}

/**
 * Canvas utility to draw smooth rounded rectangles
 */
function drawCanvasRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  topOnly = false
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  if (topOnly) {
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + radius);
  } else {
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
  }
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Ultra-Fast & Publication-Grade Multi-Chart PNG Exporter
 * Renders all charts (Bar, Pie, Area/Line) + KPI Summary + 3-Column Breakdown Table
 * into a single unified 2x Retina PNG image in under 50ms.
 */
function exportMultiChartToPng(multiData: any) {
  if (!multiData) return;
  const rawCharts = Array.isArray(multiData.charts) ? multiData.charts : [];
  if (rawCharts.length === 0) return;

  const boardTitle = multiData.title || 'Rekapitulasi Visual Grafik SM-Sinau';
  const boardSubtitle = multiData.subtitle || `${rawCharts.length} Visualisasi Data Terpadu Data Akademik - SM-Sinau`;
  const DEFAULT_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'];

  // Normalize each chart
  const charts = rawCharts.map((c: any, cIdx: number) => {
    const rawList = Array.isArray(c.data) ? c.data : Array.isArray(c.items) ? c.items : [];
    const data = rawList.map((item: any, idx: number) => {
      const name = String(item.name || item.label || item.kategori || item.jenis || `Item ${idx + 1}`);
      const value = Number(item.value || item.count || item.total || item.jumlah || 0);
      const color = item.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
      return { name, value, color };
    });
    const total = data.reduce((acc: number, curr: any) => acc + curr.value, 0);
    const maxVal = Math.max(...data.map((d: any) => d.value), 1);
    const rawType = (c.type || 'bar').toLowerCase();
    const type = ['pie', 'donut'].includes(rawType) ? 'pie' : ['line', 'area', 'tren'].includes(rawType) ? 'line' : 'bar';
    return {
      title: c.title || `Grafik ${cIdx + 1}`,
      subtitle: c.subtitle || 'Statistik Akademik & Pembelajaran SM-Sinau',
      type,
      rawType,
      data,
      total,
      maxVal,
    };
  });

  const width = 1050;
  const outerPad = 24;
  const gap = 16;
  const contentWidth = width - outerPad * 2;
  const colWidth = (contentWidth - gap) / 2;
  const cardHeight = 310;

  // Chart Grid rows
  const isThree = charts.length === 3;
  const rows = isThree ? 2 : Math.ceil(charts.length / 2);
  const gridHeight = rows * cardHeight + (rows - 1) * gap;
  const headerHeight = 94;

  // 3-Column Table Cards Layout calculation
  const tableCols = charts.length >= 3 ? 3 : charts.length === 2 ? 2 : 1;
  const tableGap = 12;
  const innerPad = 16;
  const cardW = (contentWidth - innerPad * 2 - (tableCols - 1) * tableGap) / tableCols;
  const numTableRows = Math.ceil(charts.length / tableCols);

  const rowHeights: number[] = [];
  for (let r = 0; r < numTableRows; r++) {
    let maxItems = 0;
    for (let c = 0; c < tableCols; c++) {
      const cIdx = r * tableCols + c;
      if (cIdx < charts.length) {
        maxItems = Math.max(maxItems, charts[cIdx].data.length);
      }
    }
    const rH = 38 + maxItems * 26 + 10;
    rowHeights.push(rH);
  }
  const totalCardsHeight = rowHeights.reduce((sum, h) => sum + h, 0) + (numTableRows - 1) * tableGap;
  const fullTableCardHeight = 44 + innerPad + totalCardsHeight + innerPad;
  const allRowsCount = charts.reduce((sum: number, c: any) => sum + c.data.length, 0);

  const height = outerPad + headerHeight + gap + gridHeight + gap + fullTableCardHeight + outerPad;
  const scale = 2; // 2x Retina

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = '#F4F7FE';
  ctx.fillRect(0, 0, width, height);

  // 1. Executive Master Header Card
  const hX = outerPad;
  const hY = outerPad;
  const headerRadius = 16;

  ctx.save();
  drawCanvasRoundRect(ctx, hX, hY, contentWidth, headerHeight, headerRadius);
  ctx.clip();

  ctx.fillStyle = '#0F172A';
  ctx.fillRect(hX, hY, contentWidth, headerHeight);

  // Icon container (<BarChart2 /> in blue container)
  const iconBoxSize = 36;
  const iconBoxX = hX + 20;
  const iconBoxY = hY + 16;
  drawCanvasRoundRect(ctx, iconBoxX, iconBoxY, iconBoxSize, iconBoxSize, 10);
  ctx.fillStyle = 'rgba(37, 99, 235, 0.35)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw mini chart icon bars
  ctx.fillStyle = '#60A5FA';
  drawCanvasRoundRect(ctx, iconBoxX + 9, iconBoxY + 18, 3.5, 10, 1);
  ctx.fill();
  drawCanvasRoundRect(ctx, iconBoxX + 16, iconBoxY + 9, 3.5, 19, 1);
  ctx.fill();
  drawCanvasRoundRect(ctx, iconBoxX + 23, iconBoxY + 13, 3.5, 15, 1);
  ctx.fill();

  // Title & Subtitle
  const textStartX = iconBoxX + iconBoxSize + 14;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 15.5px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(boardTitle, textStartX, hY + 30);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '11px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(boardSubtitle, textStartX, hY + 49);

  // Top-Right Status Badge
  const badgeText = `${charts.length} Visualisasi Terpadu`;
  ctx.font = 'bold 10.5px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
  const bTextW = ctx.measureText(badgeText).width;
  const badgePadX = 12;
  const badgeW = bTextW + badgePadX * 2;
  const badgeH = 24;
  const badgeX = hX + contentWidth - 20 - badgeW;
  const badgeY = hY + 20;

  drawCanvasRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 8);
  ctx.fillStyle = 'rgba(37, 99, 235, 0.22)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#93C5FD';
  ctx.textAlign = 'center';
  ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + 16);

  // Bottom Official Branding Line
  const stripY = hY + 68;
  const stripH = headerHeight - 68;
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(hX, stripY, contentWidth, stripH);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hX, stripY);
  ctx.lineTo(hX + contentWidth, stripY);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#38BDF8';
  ctx.font = 'bold 9.5px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('SM-SINAU V2 • LAPORAN INFOGRAFIS AKADEMIK & PEMBELAJARAN', hX + 20, stripY + 17);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#34D399';
  ctx.font = 'bold 9.5px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('STATUS: SINKRONISASI REAL-TIME', hX + contentWidth - 20, stripY + 17);

  // Green dot
  const statusTextW = ctx.measureText('STATUS: SINKRONISASI REAL-TIME').width;
  ctx.beginPath();
  ctx.arc(hX + contentWidth - 20 - statusTextW - 8, stripY + 14, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#10B981';
  ctx.fill();

  ctx.restore();

  drawCanvasRoundRect(ctx, hX, hY, contentWidth, headerHeight, headerRadius);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 2. Render Chart Cards Grid
  const curY = hY + headerHeight + gap;

  charts.forEach((chart: any, idx: number) => {
    const isFullWidth = isThree && idx === 2;
    const cWidth = isFullWidth ? contentWidth : colWidth;
    const colIdx = isFullWidth ? 0 : (idx % 2);
    const rowIdx = isThree ? (idx < 2 ? 0 : 1) : Math.floor(idx / 2);

    const cX = outerPad + (isFullWidth ? 0 : colIdx * (colWidth + gap));
    const cardY = curY + rowIdx * (cardHeight + gap);

    // Card background
    drawCanvasRoundRect(ctx, cX, cardY, cWidth, cardHeight, 16);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Sub-chart Header
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 12.5px sans-serif';
    ctx.fillText(`${idx + 1}. ${chart.title}`, cX + 18, cardY + 25);

    ctx.fillStyle = '#64748B';
    ctx.font = '10.5px sans-serif';
    ctx.fillText(chart.subtitle, cX + 18, cardY + 41);

    // Total Badge
    ctx.textAlign = 'right';
    const totText = `Total: ${chart.total.toLocaleString('id-ID')} unit`;
    ctx.font = 'bold 11px sans-serif';
    const totW = ctx.measureText(totText).width + 16;
    drawCanvasRoundRect(ctx, cX + cWidth - totW - 18, cardY + 13, totW, 22, 6);
    ctx.fillStyle = '#F1F5F9';
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#1E293B';
    ctx.fillText(totText, cX + cWidth - 26, cardY + 28);

    // Divider
    ctx.strokeStyle = '#F1F5F9';
    ctx.beginPath();
    ctx.moveTo(cX + 18, cardY + 50);
    ctx.lineTo(cX + cWidth - 18, cardY + 50);
    ctx.stroke();

    // Chart Graphic Area
    const chartAreaTop = cardY + 60;
    const chartAreaBottom = cardY + cardHeight - 44;
    const chartAreaLeft = cX + 54;
    const chartAreaRight = cX + cWidth - 24;
    const chartAreaW = chartAreaRight - chartAreaLeft;
    const chartAreaH = chartAreaBottom - chartAreaTop;

    if (chart.type === 'bar') {
      const ySteps = 3;
      const rawStep = chart.maxVal / ySteps;
      const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1))));
      const niceStep = Math.max(Math.ceil(rawStep / magnitude) * magnitude, 1);
      const niceMax = niceStep * ySteps;

      ctx.strokeStyle = '#F1F5F9';
      ctx.lineWidth = 1;
      ctx.fillStyle = '#64748B';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';

      for (let s = 0; s <= ySteps; s++) {
        const yVal = Math.round(niceStep * s);
        const yPos = chartAreaBottom - (s / ySteps) * chartAreaH;

        ctx.beginPath();
        ctx.setLineDash([2, 3]);
        ctx.moveTo(chartAreaLeft, yPos);
        ctx.lineTo(chartAreaRight, yPos);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillText(yVal.toLocaleString('id-ID'), chartAreaLeft - 8, yPos + 3);
      }

      // Baseline
      ctx.strokeStyle = '#E2E8F0';
      ctx.beginPath();
      ctx.moveTo(chartAreaLeft, chartAreaBottom);
      ctx.lineTo(chartAreaRight, chartAreaBottom);
      ctx.stroke();

      // Bars
      const n = chart.data.length;
      const colW = chartAreaW / Math.max(n, 1);
      const barW = Math.min(Math.max(colW * 0.52, 22), 75);

      chart.data.forEach((item: any, bIdx: number) => {
        const centerX = chartAreaLeft + bIdx * colW + colW / 2;
        const bH = Math.max((item.value / niceMax) * chartAreaH, 4);
        const bTop = chartAreaBottom - bH;
        const bLeft = centerX - barW / 2;

        ctx.fillStyle = item.color;
        drawCanvasRoundRect(ctx, bLeft, bTop, barW, bH, 5, true);
        ctx.fill();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#64748B';
        ctx.font = '10px sans-serif';
        const truncatedName = item.name.length > 12 ? item.name.substring(0, 10) + '..' : item.name;
        ctx.fillText(truncatedName, centerX, chartAreaBottom + 16);
      });
    } else if (chart.type === 'pie') {
      // Solid Pie Chart
      const isDonut = chart.rawType === 'donut';
      const centerX = chartAreaLeft + chartAreaW * 0.5;
      const centerY = chartAreaTop + chartAreaH * 0.48;
      const outerR = Math.min(chartAreaW * 0.28, chartAreaH * 0.45);

      let startA = -Math.PI / 2;
      chart.data.forEach((item: any) => {
        const sliceA = chart.total > 0 ? (item.value / chart.total) * (Math.PI * 2) : 0;
        const endA = startA + sliceA;

        ctx.beginPath();
        if (isDonut) {
          const innerR = outerR * 0.48;
          ctx.arc(centerX, centerY, outerR, startA, endA);
          ctx.arc(centerX, centerY, innerR, endA, startA, true);
        } else {
          ctx.moveTo(centerX, centerY);
          ctx.arc(centerX, centerY, outerR, startA, endA);
        }
        ctx.closePath();
        ctx.fillStyle = item.color;
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();

        startA = endA;
      });

      if (isDonut) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(chart.total.toLocaleString('id-ID'), centerX, centerY + 1);
        ctx.fillStyle = '#64748B';
        ctx.font = '9px sans-serif';
        ctx.fillText('Total Unit', centerX, centerY + 14);
      }
    } else {
      // Line / Area
      const n = chart.data.length;
      const colW = chartAreaW / Math.max(n - 1, 1);
      const points = chart.data.map((item: any, pIdx: number) => {
        const x = chartAreaLeft + (n === 1 ? chartAreaW / 2 : pIdx * colW);
        const y = chartAreaBottom - Math.max((item.value / (chart.maxVal || 1)) * chartAreaH * 0.85, 4);
        return { x, y, item };
      });

      const grad = ctx.createLinearGradient(0, chartAreaTop, 0, chartAreaBottom);
      grad.addColorStop(0, 'rgba(37, 99, 235, 0.3)');
      grad.addColorStop(1, 'rgba(37, 99, 235, 0.02)');

      if (points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, chartAreaBottom);
        points.forEach((pt: any) => ctx.lineTo(pt.x, pt.y));
        ctx.lineTo(points[points.length - 1].x, chartAreaBottom);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        points.forEach((pt: any, i: number) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.strokeStyle = '#2563EB';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      points.forEach((pt: any) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = '#2563EB';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#64748B';
        ctx.font = '10px sans-serif';
        ctx.fillText(pt.item.name, pt.x, chartAreaBottom + 16);
      });
    }

    // Legend pills
    const legY = cardY + cardHeight - 28;
    let pillX = cX + 18;
    chart.data.slice(0, 4).forEach((item: any) => {
      const pct = chart.total > 0 ? ((item.value / chart.total) * 100).toFixed(0) + '%' : '';
      const text = `${item.name}: ${item.value.toLocaleString('id-ID')} (${pct})`;
      ctx.font = '9.5px sans-serif';
      const w = ctx.measureText(text).width + 20;

      if (pillX + w <= cX + cWidth - 18) {
        drawCanvasRoundRect(ctx, pillX, legY, w, 18, 5);
        ctx.fillStyle = '#F8FAFC';
        ctx.fill();
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.arc(pillX + 8, legY + 9, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.textAlign = 'left';
        ctx.fillStyle = '#334155';
        ctx.fillText(text, pillX + 15, legY + 12.5);

        pillX += w + 6;
      }
    });
  });

  // 3. Consolidated 3-Column Table Cards
  const tX = outerPad;
  const tY = curY + gridHeight + gap;
  drawCanvasRoundRect(ctx, tX, tY, contentWidth, fullTableCardHeight, 16);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 12.5px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Tabel Rincian Data Lengkap (Rekapitulasi Gabungan)', tX + 22, tY + 26);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#94A3B8';
  ctx.font = '10.5px sans-serif';
  ctx.fillText(`${allRowsCount} data record`, tX + contentWidth - 22, tY + 26);

  ctx.strokeStyle = '#E2E8F0';
  ctx.beginPath();
  ctx.moveTo(tX, tY + 42);
  ctx.lineTo(tX + contentWidth, tY + 42);
  ctx.stroke();

  let cardTopY = tY + 42 + innerPad;
  for (let r = 0; r < numTableRows; r++) {
    const curRowH = rowHeights[r];
    for (let c = 0; c < tableCols; c++) {
      const cIdx = r * tableCols + c;
      if (cIdx >= charts.length) continue;
      const chart = charts[cIdx];
      const curCardX = tX + innerPad + c * (cardW + tableGap);

      drawCanvasRoundRect(ctx, curCardX, cardTopY, cardW, curRowH, 12);
      ctx.fillStyle = '#F8FAFC';
      ctx.fill();
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#1E293B';
      ctx.font = 'bold 11px sans-serif';
      const maxTitleW = cardW - 65;
      let titleText = `${cIdx + 1}. ${chart.title}`;
      if (ctx.measureText(titleText).width > maxTitleW) {
        while (titleText.length > 3 && ctx.measureText(titleText + '..').width > maxTitleW) {
          titleText = titleText.substring(0, titleText.length - 1);
        }
        titleText += '..';
      }
      ctx.fillText(titleText, curCardX + 12, cardTopY + 22);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#94A3B8';
      ctx.font = '10px sans-serif';
      ctx.fillText(`${chart.data.length} item`, curCardX + cardW - 12, cardTopY + 22);

      ctx.strokeStyle = '#E2E8F0';
      ctx.beginPath();
      ctx.moveTo(curCardX + 10, cardTopY + 32);
      ctx.lineTo(curCardX + cardW - 10, cardTopY + 32);
      ctx.stroke();

      let rowItemY = cardTopY + 38;
      chart.data.forEach((item: any) => {
        drawCanvasRoundRect(ctx, curCardX + 8, rowItemY, cardW - 16, 22, 6);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = '#F1F5F9';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.arc(curCardX + 18, rowItemY + 11, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.textAlign = 'left';
        ctx.fillStyle = '#334155';
        ctx.font = '10.5px sans-serif';
        const maxNameW = cardW - 110;
        let nameText = item.name;
        if (ctx.measureText(nameText).width > maxNameW) {
          while (nameText.length > 3 && ctx.measureText(nameText + '..').width > maxNameW) {
            nameText = nameText.substring(0, nameText.length - 1);
          }
          nameText += '..';
        }
        ctx.fillText(nameText, curCardX + 26, rowItemY + 15);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(item.value.toLocaleString('id-ID'), curCardX + cardW - 48, rowItemY + 15);

        const pct = chart.total > 0 ? ((item.value / chart.total) * 100).toFixed(1) + '%' : '-';
        ctx.fillStyle = '#64748B';
        ctx.font = '10px sans-serif';
        ctx.fillText(pct, curCardX + cardW - 12, rowItemY + 15);

        rowItemY += 26;
      });
    }
    cardTopY += curRowH + tableGap;
  }

  // 4. Download file
  canvas.toBlob((blob) => {
    if (!blob) return;
    const pngUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const cleanFileName = boardTitle.toLowerCase().replace(/[^a-z0-9_-]/g, '_').substring(0, 45);
    a.href = pngUrl;
    a.download = `${cleanFileName || 'rekap_multi_grafik_sm_sinau'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(pngUrl);
  }, 'image/png');
}

/**
 * Single Chart PNG Exporter
 */
function exportChartToPng(chartData: any) {
  if (!chartData) return;

  const rawList = Array.isArray(chartData.data)
    ? chartData.data
    : Array.isArray(chartData.items)
      ? chartData.items
      : [];
  if (rawList.length === 0) return;

  const title = chartData.title || 'Grafik Rekapitulasi Data Akademik & Pembelajaran';
  const rawType = (chartData.type || 'bar').toLowerCase();
  const type = ['pie', 'donut'].includes(rawType)
    ? 'pie'
    : ['line', 'area', 'tren'].includes(rawType)
      ? 'line'
      : 'bar';

  const DEFAULT_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'];

  const data = rawList.map((item: any, idx: number) => {
    const name = String(item.name || item.label || item.kategori || item.jenis || `Kategori ${idx + 1}`);
    const value = Number(item.value || item.count || item.total || item.jumlah || 0);
    const color = item.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
    return { name, value, color };
  });

  const total = data.reduce((acc: number, curr: any) => acc + curr.value, 0);
  const maxVal = Math.max(...data.map((d: any) => d.value), 1);
  const maxItem = data.reduce((prev: any, curr: any) => (curr.value > prev.value ? curr : prev), data[0]);

  const width = 1000;
  const outerPad = 24;
  const c1Width = width - outerPad * 2;
  const c1Height = 440;
  const spaceBetween = 18;
  const c2Width = c1Width;
  const c2Height = 44 + 36 + data.length * 40;

  const height = outerPad + c1Height + spaceBetween + c2Height + outerPad;
  const scale = 2; // 2x Retina

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(scale, scale);

  ctx.fillStyle = '#F4F7FE';
  ctx.fillRect(0, 0, width, height);

  const c1X = outerPad;
  const c1Y = outerPad;
  drawCanvasRoundRect(ctx, c1X, c1Y, c1Width, c1Height, 18);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.stroke();

  // KPI Strip
  const kpiY = c1Y + 18;
  ctx.fillStyle = '#64748B';
  ctx.font = '11.5px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Total:', c1X + 20, kpiY + 18);

  const totalBoxX = c1X + 58;
  drawCanvasRoundRect(ctx, totalBoxX, kpiY + 2, 90, 24, 6);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(total.toLocaleString('id-ID') + ' unit', totalBoxX + 8, kpiY + 18);

  if (maxItem) {
    const maxLblX = totalBoxX + 104;
    ctx.fillStyle = '#64748B';
    ctx.font = '11.5px sans-serif';
    ctx.fillText('Tertinggi:', maxLblX, kpiY + 18);

    const maxText = `${maxItem.name} (${maxItem.value.toLocaleString('id-ID')})`;
    ctx.font = 'bold 11.5px sans-serif';
    const maxTextWidth = ctx.measureText(maxText).width;
    const maxBoxX = maxLblX + 58;

    drawCanvasRoundRect(ctx, maxBoxX, kpiY + 2, maxTextWidth + 16, 24, 6);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#0F172A';
    ctx.fillText(maxText, maxBoxX + 8, kpiY + 18);
  }

  // Chart Graphic
  const chartTop = c1Y + 68;
  const chartBottom = c1Y + c1Height - 54;
  const chartLeft = c1X + 64;
  const chartRight = c1X + c1Width - 36;
  const chartW = chartRight - chartLeft;
  const chartH = chartBottom - chartTop;

  if (type === 'bar') {
    const ySteps = 4;
    const rawStep = maxVal / ySteps;
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1))));
    const niceStep = Math.max(Math.ceil(rawStep / magnitude) * magnitude, 1);
    const niceMax = niceStep * ySteps;

    ctx.strokeStyle = '#F1F5F9';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748B';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';

    for (let s = 0; s <= ySteps; s++) {
      const yVal = Math.round(niceStep * s);
      const yPos = chartBottom - (s / ySteps) * chartH;
      ctx.beginPath();
      ctx.setLineDash([3, 4]);
      ctx.moveTo(chartLeft, yPos);
      ctx.lineTo(chartRight, yPos);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillText(yVal.toLocaleString('id-ID'), chartLeft - 10, yPos + 4);
    }

    ctx.strokeStyle = '#E2E8F0';
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();

    const n = data.length;
    const colW = chartW / Math.max(n, 1);
    const barW = Math.min(Math.max(colW * 0.48, 28), 90);

    data.forEach((item: any, idx: number) => {
      const centerX = chartLeft + idx * colW + colW / 2;
      const bH = Math.max((item.value / niceMax) * chartH, 6);
      const bTop = chartBottom - bH;
      const bLeft = centerX - barW / 2;

      ctx.fillStyle = item.color;
      drawCanvasRoundRect(ctx, bLeft, bTop, barW, bH, 6, true);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#64748B';
      ctx.font = '11.5px sans-serif';
      const truncatedName = item.name.length > 15 ? item.name.substring(0, 13) + '..' : item.name;
      ctx.fillText(truncatedName, centerX, chartBottom + 22);
    });
  } else if (type === 'pie') {
    const isDonut = rawType === 'donut';
    const centerX = chartLeft + chartW * 0.5;
    const centerY = chartTop + chartH * 0.48;
    const outerR = Math.min(chartW * 0.28, chartH * 0.46);

    let startA = -Math.PI / 2;
    data.forEach((item: any) => {
      const sliceA = total > 0 ? (item.value / total) * (Math.PI * 2) : 0;
      const endA = startA + sliceA;

      ctx.beginPath();
      if (isDonut) {
        const innerR = outerR * 0.48;
        ctx.arc(centerX, centerY, outerR, startA, endA);
        ctx.arc(centerX, centerY, innerR, endA, startA, true);
      } else {
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, outerR, startA, endA);
      }
      ctx.closePath();
      ctx.fillStyle = item.color;
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      startA = endA;
    });

    if (isDonut) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(total.toLocaleString('id-ID'), centerX, centerY + 2);
      ctx.fillStyle = '#64748B';
      ctx.font = '11px sans-serif';
      ctx.fillText('Total Unit', centerX, centerY + 20);
    }
  } else {
    // Line / Area
    const n = data.length;
    const colW = chartW / Math.max(n - 1, 1);
    const points = data.map((item: any, idx: number) => {
      const x = chartLeft + (n === 1 ? chartW / 2 : idx * colW);
      const y = chartBottom - Math.max((item.value / (maxVal || 1)) * chartH * 0.85, 6);
      return { x, y, item };
    });

    const grad = ctx.createLinearGradient(0, chartTop, 0, chartBottom);
    grad.addColorStop(0, 'rgba(37, 99, 235, 0.3)');
    grad.addColorStop(1, 'rgba(37, 99, 235, 0.02)');

    if (points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, chartBottom);
      points.forEach((pt: any) => ctx.lineTo(pt.x, pt.y));
      ctx.lineTo(points[points.length - 1].x, chartBottom);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      points.forEach((pt: any, i: number) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    points.forEach((pt: any) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#64748B';
      ctx.font = '11px sans-serif';
      ctx.fillText(pt.item.name, pt.x, chartBottom + 20);
    });
  }

  // Legend Pills
  const legendY = c1Y + c1Height - 34;
  let pillX = c1X + 24;
  data.forEach((item: any) => {
    const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) + '%' : '';
    const text = `${item.name}: ${item.value.toLocaleString('id-ID')} (${pct})`;
    ctx.font = '10.5px sans-serif';
    const textWidth = ctx.measureText(text).width;
    const pillW = textWidth + 28;

    if (pillX + pillW <= c1X + c1Width - 24) {
      drawCanvasRoundRect(ctx, pillX, legendY, pillW, 22, 6);
      ctx.fillStyle = '#F8FAFC';
      ctx.fill();
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(pillX + 10, legendY + 11, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#334155';
      ctx.fillText(text, pillX + 18, legendY + 15);

      pillX += pillW + 8;
    }
  });

  // 2. Card 2: Table
  const c2X = outerPad;
  const c2Y = c1Y + c1Height + spaceBetween;
  drawCanvasRoundRect(ctx, c2X, c2Y, c2Width, c2Height, 18);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Tabel Rincian Data Grafik', c2X + 24, c2Y + 28);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748B';
  ctx.font = '11.5px sans-serif';
  ctx.fillText(`${data.length} data record`, c2X + c2Width - 24, c2Y + 28);

  const tblY = c2Y + 44;
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(c2X, tblY, c2Width, 36);
  ctx.strokeStyle = '#E2E8F0';
  ctx.beginPath();
  ctx.moveTo(c2X, tblY + 36);
  ctx.lineTo(c2X + c2Width, tblY + 36);
  ctx.stroke();

  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('NO', c2X + 24, tblY + 22);
  ctx.fillText('KATEGORI / LABEL', c2X + 70, tblY + 22);
  ctx.textAlign = 'right';
  ctx.fillText('KUANTITAS / NILAI', c2X + c2Width - 140, tblY + 22);
  ctx.fillText('PERSENTASE', c2X + c2Width - 24, tblY + 22);

  data.forEach((item: any, idx: number) => {
    const rowY = tblY + 36 + idx * 40;
    ctx.strokeStyle = '#F1F5F9';
    ctx.beginPath();
    ctx.moveTo(c2X + 20, rowY + 40);
    ctx.lineTo(c2X + c2Width - 20, rowY + 40);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#94A3B8';
    ctx.font = '11px sans-serif';
    ctx.fillText(String(idx + 1), c2X + 24, rowY + 24);

    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(c2X + 75, rowY + 20, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 11.5px sans-serif';
    ctx.fillText(item.name, c2X + 86, rowY + 24);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(item.value.toLocaleString('id-ID'), c2X + c2Width - 140, rowY + 24);

    const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) + '%' : '-';
    ctx.fillStyle = '#64748B';
    ctx.font = '11px sans-serif';
    ctx.fillText(pct, c2X + c2Width - 24, rowY + 24);
  });

  canvas.toBlob((blob) => {
    if (!blob) return;
    const pngUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const cleanFileName = title.toLowerCase().replace(/[^a-z0-9_-]/g, '_').substring(0, 40);
    a.href = pngUrl;
    a.download = `${cleanFileName || 'grafik_sm_sinau'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(pngUrl);
  }, 'image/png');
}

function downloadCapturedVisual(targetEl: HTMLElement | null, fallbackData: any, title: string = 'grafik_sm_sinau') {
  if (fallbackData?.isMulti || fallbackData?.charts) {
    exportMultiChartToPng(fallbackData);
  } else {
    exportChartToPng(fallbackData);
  }
}

// Subcomponent: AleshaMultiChartBoard
interface AleshaMultiChartBoardProps {
  charts: any[];
  title?: string;
  subtitle?: string;
  onExpand?: (data: any) => void;
  isModal?: boolean;
}

function AleshaMultiChartBoard({ charts, title, subtitle, onExpand, isModal = false }: AleshaMultiChartBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizedCharts = useMemo(() => {
    return (charts || []).map((chart, cIdx) => {
      const cTitle = chart.title || `Grafik ${cIdx + 1}`;
      const cSub = chart.subtitle || 'Statistik Akademik & Pembelajaran SM-Sinau';
      const rawType = (chart.type || 'bar').toLowerCase();
      const type = ['pie', 'donut'].includes(rawType)
        ? 'pie'
        : ['line', 'area', 'tren'].includes(rawType)
          ? 'line'
          : 'bar';

      const rawList = Array.isArray(chart.data)
        ? chart.data
        : Array.isArray(chart.items)
          ? chart.items
          : [];

      const data = rawList.map((item: any, idx: number) => {
        const name = String(item.name || item.label || item.kategori || item.jenis || `Kategori ${idx + 1}`);
        const value = Number(item.value || item.count || item.total || item.jumlah || 0);
        const color = item.color || DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length];
        return { ...item, name, value, color };
      });

      const total = data.reduce((acc: number, curr: any) => acc + curr.value, 0);
      const maxItem = data.length > 0
        ? data.reduce((prev: any, curr: any) => (curr.value > prev.value ? curr : prev), data[0])
        : null;

      return {
        ...chart,
        title: cTitle,
        subtitle: cSub,
        type,
        rawType,
        data,
        total,
        maxItem,
      };
    });
  }, [charts]);

  const boardTitle = title || 'Rekapitulasi Visual Grafik Terpadu SM-Sinau';
  const boardSubtitle = subtitle || `${normalizedCharts.length} Visualisasi Data Terpadu Data Akademik - SM-Sinau`;

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    downloadCapturedVisual(containerRef.current, { isMulti: true, charts: normalizedCharts, title: boardTitle }, boardTitle);
  };

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    onExpand?.({ isMulti: true, charts: normalizedCharts, title: boardTitle, subtitle: boardSubtitle });
  };

  if (normalizedCharts.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={`rounded-3xl bg-[#F4F7FE] border border-slate-200/90 shadow-sm overflow-hidden transition-all duration-200 ${!isModal ? 'my-4 hover:shadow-md hover:border-brand-300 dark:border-brand-700' : ''
        }`}
    >
      {!isModal && (
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand-700/30 border border-brand-500/40 text-blue-400 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm sm:text-base font-bold text-white truncate tracking-tight">{boardTitle}</h4>
                <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-50 dark:bg-brand-900/300/20 text-blue-300 border border-brand-400/30">
                  {normalizedCharts.length} Grafik Terpadu
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">{boardSubtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDownload}
              title="Unduh Seluruh Visual Grafik dalam 1 Gambar PNG Resolusi Tinggi"
              className="px-3.5 py-2 rounded-xl bg-brand-700 hover:bg-brand-50 dark:bg-brand-900/300 active:scale-95 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Unduh Semua Grafik (1 Gambar PNG)</span>
              <span className="sm:hidden">Unduh 1 PNG</span>
            </button>
            {onExpand && (
              <button
                onClick={handleExpand}
                title="Perbesar Tampilan Dashboard Grafik"
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Official Sub-Banner Branding */}
      <div className={`px-6 py-3 bg-white border-b border-slate-200/80 flex items-center justify-between text-[11px] text-slate-600 ${isModal ? 'rounded-t-3xl' : ''}`}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-4 rounded-full bg-brand-700" />
          <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
            SM-SINAU V2 &bull; SISTEM INFORMASI AKADEMIK
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            SINKRONISASI REAL-TIME
          </span>
        </div>
      </div>

      {/* Body: Charts Grid */}
      <div className="p-4 sm:p-6 space-y-4">
        <div className={`grid grid-cols-1 ${normalizedCharts.length >= 2 ? 'md:grid-cols-2' : ''} gap-4`}>
          {normalizedCharts.map((chart, idx) => {
            const isFullWidth = normalizedCharts.length === 3 && idx === 2;
            const chartHeight = isModal ? (isFullWidth ? 270 : 230) : (isFullWidth ? 250 : 210);

            return (
              <div
                key={idx}
                className={`bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5 flex flex-col justify-between transition-all hover:shadow-xs ${isFullWidth ? 'md:col-span-2' : ''
                  }`}
              >
                {/* Sub-chart Header */}
                <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-brand-50 dark:bg-brand-900/30 border border-blue-100 flex items-center justify-center text-brand-700 dark:text-brand-400 shrink-0">
                      {chart.type === 'pie' ? (
                        <PieIcon className="w-4 h-4" />
                      ) : chart.type === 'line' ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <BarChart2 className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h5 className="text-xs sm:text-sm font-bold text-slate-800 truncate tracking-tight">
                        {idx + 1}. {chart.title}
                      </h5>
                      <p className="text-[11px] text-slate-400 truncate">{chart.subtitle}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/80">
                      Total: {chart.total.toLocaleString('id-ID')} unit
                    </span>
                  </div>
                </div>

                {/* Sub-chart Interactive Visual */}
                <div className="w-full" style={{ height: chartHeight }}>
                  <ResponsiveContainer width="100%" height="100%">
                    {chart.type === 'pie' ? (
                      <PieChart>
                        <RechartsTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload;
                              const pct = chart.total > 0 ? ((d.value / chart.total) * 100).toFixed(1) : 0;
                              return (
                                <div className="bg-slate-900 text-white rounded-xl shadow-xl p-2.5 text-xs border border-slate-800">
                                  <div className="font-semibold text-slate-200">{d.name}</div>
                                  <div className="text-blue-400 font-bold text-sm mt-0.5">
                                    {d.value.toLocaleString('id-ID')} unit
                                    <span className="text-slate-400 text-[11px] ml-1.5 font-normal">({pct}%)</span>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Pie
                          data={chart.data}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={chart.rawType === 'pie' ? 0 : 45}
                          outerRadius={isModal ? 95 : 75}
                          paddingAngle={chart.rawType === 'pie' ? 0 : 3}
                          isAnimationActive={false}
                        >
                          {chart.data.map((entry: any, i: number) => (
                            <Cell key={`cell-${i}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    ) : chart.type === 'line' ? (
                      <AreaChart data={chart.data} margin={{ top: 15, right: 15, left: -10, bottom: 20 }}>
                        <defs>
                          <linearGradient id={`areaGrad-logistik-${idx}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          axisLine={{ stroke: '#e2e8f0' }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(val) => Number(val).toLocaleString('id-ID')}
                        />
                        <RechartsTooltip
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-slate-900 text-white rounded-xl shadow-xl p-2.5 text-xs border border-slate-800">
                                  <div className="font-semibold text-slate-200">{label}</div>
                                  <div className="text-blue-400 font-bold text-sm mt-0.5">
                                    {Number(payload[0].value).toLocaleString('id-ID')} unit
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#2563eb"
                          strokeWidth={3}
                          fill={`url(#areaGrad-logistik-${idx})`}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    ) : (
                      <BarChart data={chart.data} margin={{ top: 15, right: 15, left: -10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          axisLine={{ stroke: '#e2e8f0' }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(val) => Number(val).toLocaleString('id-ID')}
                        />
                        <RechartsTooltip
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload;
                              const pct = chart.total > 0 ? ((d.value / chart.total) * 100).toFixed(1) : 0;
                              return (
                                <div className="bg-slate-900 text-white rounded-xl shadow-xl p-2.5 text-xs border border-slate-800">
                                  <div className="font-semibold text-slate-200">{label}</div>
                                  <div className="text-blue-400 font-bold text-sm mt-0.5">
                                    {d.value.toLocaleString('id-ID')} unit
                                    <span className="text-slate-400 text-[11px] ml-1.5 font-normal">({pct}%)</span>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                          {chart.data.map((entry: any, i: number) => (
                            <Cell key={`cell-${i}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>

                {/* Sub-chart Legend Pills */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3 pt-2.5 border-t border-slate-100">
                  {chart.data.map((item: any, i: number) => {
                    const pct = chart.total > 0 ? ((item.value / chart.total) * 100).toFixed(1) : 0;
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200/80 text-[10px] text-slate-700 shadow-3xs"
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="font-medium truncate max-w-[120px]">{item.name}:</span>
                        <span className="font-bold text-slate-900">{item.value.toLocaleString('id-ID')}</span>
                        <span className="text-slate-400 text-[9px]">({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Consolidated Data Tables Breakdown (3 Columns per category) */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="px-4 py-3 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-800">
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-700 dark:text-brand-400" />
              <span>Tabel Rincian Data Lengkap (Rekapitulasi Gabungan)</span>
            </span>
            <span className="text-[11px] font-normal text-slate-500">
              {normalizedCharts.reduce((sum, c) => sum + c.data.length, 0)} data record
            </span>
          </div>

          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {normalizedCharts.map((c, cIdx) => (
              <div key={cIdx} className="bg-slate-50 rounded-xl p-3 border border-slate-200/70 text-xs">
                <div className="font-bold text-slate-800 mb-2 pb-1.5 border-b border-slate-200 flex items-center justify-between">
                  <span className="truncate">{cIdx + 1}. {c.title}</span>
                  <span className="text-[10px] font-normal text-slate-500">{c.data.length} item</span>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                  {c.data.map((d: any, dIdx: number) => {
                    const val = Number(d.value || 0);
                    const pct = c.total > 0 ? ((val / c.total) * 100).toFixed(1) + '%' : '-';
                    return (
                      <div key={dIdx} className="flex items-center justify-between text-[11px] bg-white p-1.5 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-1.5 truncate pr-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color || '#2563eb' }} />
                          <span className="text-slate-700 font-medium truncate">{d.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-bold text-slate-900">{val.toLocaleString('id-ID')}</span>
                          <span className="text-slate-400 text-[10px] w-10 text-right">{pct}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!isModal && (
        <div className="px-5 py-2.5 bg-slate-100/90 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
          <span>💡 Seluruh visualisasi grafik di atas terintegrasi dalam 1 berkas gambar PNG beresolusi tinggi</span>
          <span className="font-bold text-brand-800 dark:text-brand-300">SM-Sinau Multi-Chart Visualizer</span>
        </div>
      )}
    </div>
  );
}

// Subcomponent: AleshaChartViewer (Single Chart)
interface AleshaChartViewerProps {
  chartData: any;
  onExpand?: (data: any) => void;
  isModal?: boolean;
}

function AleshaChartViewer({ chartData, onExpand, isModal = false }: AleshaChartViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rawList = Array.isArray(chartData.data)
    ? chartData.data
    : Array.isArray(chartData.items)
      ? chartData.items
      : [];

  const rawType = (chartData.type || 'bar').toLowerCase();
  const type = ['pie', 'donut'].includes(rawType)
    ? 'pie'
    : ['line', 'area', 'tren'].includes(rawType)
      ? 'line'
      : 'bar';

  const data = useMemo(() => {
    return rawList.map((item: any, idx: number) => {
      const name = String(item.name || item.label || item.kategori || item.jenis || `Kategori ${idx + 1}`);
      const value = Number(item.value || item.count || item.total || item.jumlah || 0);
      const color = item.color || DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length];
      return { ...item, name, value, color };
    });
  }, [rawList]);

  const total = useMemo(() => data.reduce((acc: number, curr: any) => acc + curr.value, 0), [data]);
  const maxItem = useMemo(() => {
    if (data.length === 0) return null;
    return data.reduce((prev: any, curr: any) => (curr.value > prev.value ? curr : prev), data[0]);
  }, [data]);

  const chartTitle = chartData.title || 'Grafik Rekapitulasi Data Akademik & Pembelajaran';
  const chartSubtitle = chartData.subtitle || 'Statistik Akademik & Pembelajaran SM-Sinau';

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    downloadCapturedVisual(containerRef.current, chartData, chartTitle);
  };

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    onExpand?.(chartData);
  };

  if (data.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={`rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden transition-all duration-200 ${!isModal ? 'my-3 hover:shadow-md hover:border-brand-300 dark:border-brand-700' : ''
        }`}
    >
      {/* Chart Header Bar */}
      <div className="px-4 py-3 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between gap-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-brand-700/30 border border-brand-500/40 text-blue-400 flex items-center justify-center shrink-0">
            {type === 'pie' ? (
              <PieIcon className="w-4 h-4" />
            ) : type === 'line' ? (
              <TrendingUp className="w-4 h-4" />
            ) : (
              <BarChart2 className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-bold text-white truncate tracking-tight">{chartTitle}</h4>
            <p className="text-[11px] text-slate-400 truncate">{chartSubtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleDownload}
            title="Unduh Grafik sebagai Gambar PNG Resolusi Tinggi"
            className="px-2.5 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-50 dark:bg-brand-900/300 text-white text-[11px] font-medium flex items-center gap-1.5 shadow-2xs transition active:scale-95 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Unduh PNG</span>
          </button>
          {!isModal && onExpand && (
            <button
              onClick={handleExpand}
              title="Perbesar Grafik"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* KPI Metrics Strip */}
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200/80 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
        <div className="flex items-center gap-2">
          <span>Total:</span>
          <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-3xs">
            {total.toLocaleString('id-ID')} unit
          </span>
        </div>
        {maxItem && (
          <div className="flex items-center gap-2 text-[11px]">
            <span>Tertinggi:</span>
            <span className="font-semibold text-brand-800 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/30 px-2 py-0.5 rounded border border-brand-200 dark:border-brand-800/40">
              {maxItem.name} ({maxItem.value.toLocaleString('id-ID')})
            </span>
          </div>
        )}
      </div>

      {/* Chart Visual */}
      <div className="p-4" style={{ height: isModal ? 380 : 270 }}>
        <ResponsiveContainer width="100%" height="100%">
          {type === 'pie' ? (
            <PieChart>
              <RechartsTooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : 0;
                    return (
                      <div className="bg-slate-900 text-white rounded-xl shadow-xl p-2.5 text-xs border border-slate-800">
                        <div className="font-semibold text-slate-200">{d.name}</div>
                        <div className="text-blue-400 font-bold text-sm mt-0.5">
                          {d.value.toLocaleString('id-ID')} unit
                          <span className="text-slate-400 text-[11px] ml-1.5 font-normal">({pct}%)</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={rawType === 'pie' ? 0 : 50}
                outerRadius={isModal ? 120 : 85}
                paddingAngle={rawType === 'pie' ? 0 : 3}
                isAnimationActive={false}
              >
                {data.map((entry: any, i: number) => (
                  <Cell key={`cell-${i}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          ) : type === 'line' ? (
            <AreaChart data={data} margin={{ top: 15, right: 15, left: -10, bottom: 20 }}>
              <defs>
                <linearGradient id="areaGrad-single-logistik" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => Number(val).toLocaleString('id-ID')}
              />
              <RechartsTooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-slate-900 text-white rounded-xl shadow-xl p-2.5 text-xs border border-slate-800">
                        <div className="font-semibold text-slate-200">{label}</div>
                        <div className="text-blue-400 font-bold text-sm mt-0.5">
                          {Number(payload[0].value).toLocaleString('id-ID')} unit
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} fill="url(#areaGrad-single-logistik)" isAnimationActive={false} />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 15, right: 15, left: -10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => Number(val).toLocaleString('id-ID')}
              />
              <RechartsTooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : 0;
                    return (
                      <div className="bg-slate-900 text-white rounded-xl shadow-xl p-2.5 text-xs border border-slate-800">
                        <div className="font-semibold text-slate-200">{label}</div>
                        <div className="text-blue-400 font-bold text-sm mt-0.5">
                          {d.value.toLocaleString('id-ID')} unit
                          <span className="text-slate-400 text-[11px] ml-1.5 font-normal">({pct}%)</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                {data.map((entry: any, i: number) => (
                  <Cell key={`cell-${i}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Legend Pills */}
      <div className="px-4 py-2.5 bg-slate-50/80 border-t border-slate-100 flex flex-wrap items-center justify-center gap-2">
        {data.map((item: any, i: number) => {
          const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
          return (
            <div
              key={i}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200/80 text-[11px] text-slate-700 shadow-3xs"
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="font-medium truncate max-w-[140px]">{item.name}:</span>
              <span className="font-bold text-slate-900">{item.value.toLocaleString('id-ID')}</span>
              <span className="text-slate-400 text-[10px]">({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Markdown Message Renderer
/**
 * Lightweight Markdown Parser & Renderer Component (No External Lib Dependencies)
 */
interface MarkdownViewerProps {
  content: string;
  onExpandChart?: (chartData: any) => void;
  onPreviewImage?: (img: { src: string; title: string }) => void;
}

function MarkdownViewer({ content, onExpandChart, onPreviewImage }: MarkdownViewerProps) {
  const renderedElements = useMemo(() => {
    if (!content) return null;

    // 1. Pre-scan for multiple chart blocks to combine them into 1 unified image & board
    const extractedCharts: any[] = [];
    const chartRegex = /```(?:chart(?::([a-z0-9_-]+))?|json:chart)\s*([\s\S]*?)```/gi;
    let m;
    while ((m = chartRegex.exec(content)) !== null) {
      try {
        let cleaned = m[2].trim();
        cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
        const parsed = JSON.parse(cleaned);
        const cType = m[1] || parsed.type || 'bar';
        if (parsed.charts && Array.isArray(parsed.charts)) {
          extractedCharts.push(...parsed.charts);
        } else if (parsed.data && Array.isArray(parsed.data)) {
          parsed.type = cType;
          extractedCharts.push(parsed);
        }
      } catch (e) {
        // ignore parse error during pre-scan
      }
    }

    let processedContent = content;
    const isMultiChart = extractedCharts.length > 1;

    if (isMultiChart) {
      // Consolidate all chart blocks & their preceding numbered headings into a single [[MULTI_CHART_BOARD]] marker
      const multiBlockRegex = /(?:\n*(?:(?:\d+\.|\*|-)\s+[^\n]+)?\s*\n*```(?:chart(?::[a-z0-9_-]+)?|json:chart)[\s\S]*?```)+/gi;
      let replacedOnce = false;
      processedContent = processedContent.replace(multiBlockRegex, () => {
        if (!replacedOnce) {
          replacedOnce = true;
          return '\n\n[[MULTI_CHART_BOARD]]\n\n';
        }
        return '';
      });
    }

    // Pre-process and normalize markdown strings
    const normalized = normalizeMarkdown(processedContent);
    const lines = normalized.split('\n');
    const elements: React.ReactNode[] = [];
    let inTable = false;
    let tableRows: string[][] = [];
    let inCodeBlock = false;
    let codeBlockText = '';
    let codeLanguage = '';
    let currentListIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Multi-Chart Board Marker (Combines all charts into 1 single visual image & dashboard)
      if (line.trim() === '[[MULTI_CHART_BOARD]]') {
        elements.push(
          <AleshaMultiChartBoard
            key={`multi-chart-${i}`}
            charts={extractedCharts}
            title="Rekapitulasi Visual Grafik SM-Sinau"
            subtitle={`${extractedCharts.length} Visualisasi Data Terpadu (Bar, Pie, Tren)`}
            onExpand={onExpandChart}
          />
        );
        continue;
      }

      // Code Block Boundary
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          const lang = (codeLanguage || '').toLowerCase().trim();
          if (lang.startsWith('chart') || lang.startsWith('json:chart')) {
            try {
              let cleaned = codeBlockText.trim();
              // Clean relaxed JSON (trailing commas)
              cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
              const chartData = JSON.parse(cleaned);
              const chartType = lang.includes(':') ? lang.split(':')[1] : (chartData.type || 'bar');
              chartData.type = chartType;
              elements.push(
                <AleshaChartViewer
                  key={`chart-${i}`}
                  chartData={chartData}
                  onExpand={onExpandChart}
                />
              );
            } catch (jsonErr) {
              console.warn('[MarkdownViewer] Failed to parse chart block JSON:', jsonErr);
              elements.push(
                <pre key={`code-${i}`} className="p-3.5 my-2.5 bg-slate-900 text-slate-100 rounded-xl overflow-x-auto text-[11px] font-mono leading-relaxed shadow-inner">
                  <code>{codeBlockText.trim()}</code>
                </pre>
              );
            }
          } else {
            elements.push(
              <pre key={`code-${i}`} className="p-3.5 my-2.5 bg-slate-900 text-slate-100 rounded-xl overflow-x-auto text-[11px] font-mono leading-relaxed shadow-inner">
                <code>{codeBlockText.trim()}</code>
              </pre>
            );
          }
          inCodeBlock = false;
          codeBlockText = '';
          codeLanguage = '';
        } else {
          inCodeBlock = true;
          codeLanguage = line.trim().slice(3).trim();
        }
        currentListIndex = 0;
        continue;
      }

      if (inCodeBlock) {
        codeBlockText += (codeBlockText ? '\n' : '') + line;
        continue;
      }

      // Markdown Table Parser
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const cells = line
          .trim()
          .split('|')
          .slice(1, -1)
          .map(c => c.trim());

        // Skip divider row |---|---|
        if (cells.every(c => /^[-:\s]+$/.test(c))) {
          continue;
        }

        if (!inTable) {
          inTable = true;
          tableRows = [cells];
        } else {
          tableRows.push(cells);
        }
        currentListIndex = 0;
        continue;
      } else if (inTable) {
        // Table finished, render table
        elements.push(renderInformativeTable(tableRows, `table-${i}`));
        inTable = false;
        tableRows = [];
      }

      // Reset list numbering if empty line or header
      if (!line.trim() || line.startsWith('#')) {
        currentListIndex = 0;
      }

      // Headings
      if (line.startsWith('### ')) {
        elements.push(
          <h4 key={i} className="font-bold text-xs text-slate-900 mt-3.5 mb-1.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-700 inline-block" />
            {parseInlineFormatting(line.slice(4))}
          </h4>
        );
        continue;
      }
      if (line.startsWith('## ')) {
        elements.push(
          <h3 key={i} className="font-extrabold text-sm text-slate-900 mt-4 mb-2 border-b border-slate-200/80 pb-1.5 flex items-center gap-2">
            <span className="w-2 h-2 rounded bg-brand-700 inline-block" />
            {parseInlineFormatting(line.slice(3))}
          </h3>
        );
        continue;
      }
      if (line.startsWith('# ')) {
        elements.push(
          <h2 key={i} className="font-extrabold text-sm text-slate-950 mt-4 mb-2.5">
            {parseInlineFormatting(line.slice(2))}
          </h2>
        );
        continue;
      }

      // Bullet List (- or *)
      if (/^\s*[-*]\s+/.test(line)) {
        currentListIndex = 0;
        const itemText = line.replace(/^\s*[-*]\s+/, '');
        elements.push(
          <div key={i} className="flex items-start gap-2.5 my-1.5 pl-1.5 text-slate-700 text-[12.5px] leading-relaxed">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-50 dark:bg-brand-900/300 mt-2 flex-shrink-0 shadow-xs" />
            <div className="flex-1">
              {parseInlineFormatting(itemText)}
            </div>
          </div>
        );
        continue;
      }

      // Numbered List Item (rendered as high-visibility dedicated card row)
      const numberMatch = line.match(/^\s*(\d+)\.\s+(.*)/);
      if (numberMatch) {
        currentListIndex += 1;
        const rawNum = parseInt(numberMatch[1], 10);
        // Use sequential count if numbers repeated like 1. and 1., otherwise use specified number
        const displayNum = (rawNum === 1 && currentListIndex > 1) ? currentListIndex : rawNum;
        const itemText = numberMatch[2];

        elements.push(
          <div
            key={i}
            className="flex items-start gap-3 my-2.5 p-3 rounded-xl bg-slate-50/90 border border-slate-200/80 hover:bg-brand-50 dark:bg-brand-900/30/40 hover:border-brand-200 dark:border-brand-800/40 transition-all duration-200 shadow-2xs group"
          >
            <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-bold text-xs flex items-center justify-center shadow-xs mt-0.5 group-hover:scale-105 transition-transform">
              {displayNum}
            </div>
            <div className="flex-1 text-slate-800 text-[12.5px] leading-relaxed">
              {parseInlineFormatting(itemText)}
            </div>
          </div>
        );
        continue;
      }

      // Empty Line
      if (!line.trim()) {
        elements.push(<div key={i} className="h-1.5" />);
        continue;
      }

      // Detect Markdown Image ![Alt text](url)
      const imgMatch = line.match(/^!\[([^\]]*)\]\s*\(([^)\s]+)\)/);
      if (imgMatch) {
        const altText = imgMatch[1].trim() || 'Grafik Laporan SM-Sinau';
        const imgUrl = resolveAleshaLink(imgMatch[2].trim());
        elements.push(
          <div key={`img-${i}`} className="my-3 rounded-2xl overflow-hidden border border-slate-200/90 bg-white shadow-2xs group">
            <div
              className="relative overflow-hidden cursor-pointer bg-slate-50 flex items-center justify-center p-2.5 group"
              onClick={() => onPreviewImage?.({ src: imgUrl, title: altText })}
            >
              <img
                src={imgUrl}
                alt={altText}
                className="w-full h-auto max-h-80 object-contain rounded-xl transition-transform duration-300 group-hover:scale-[1.01]"
              />
              <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white font-semibold text-xs backdrop-blur-[1px]">
                <Maximize2 className="w-4 h-4" />
                <span>Klik untuk Memperbesar</span>
              </div>
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-slate-800 truncate">{altText}</span>
              <a
                href={imgUrl}
                download
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-1.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all flex-shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Gambar</span>
              </a>
            </div>
          </div>
        );
        continue;
      }

      // Detect Document Download Card Link (PDF, Word, Excel, CSV, PPTX, etc.)
      const docCard = parseDocumentDownloadCard(line, i);
      if (docCard) {
        elements.push(docCard);
        continue;
      }

      // Regular Paragraph
      currentListIndex = 0;
      elements.push(
        <p key={i} className="text-slate-800 my-1 leading-relaxed text-[12.5px]">
          {parseInlineFormatting(line)}
        </p>
      );
    }

    // Flush any remaining table at end
    if (inTable && tableRows.length > 0) {
      elements.push(renderInformativeTable(tableRows, 'table-end'));
    }

    return elements;
  }, [content]);

  return <div className="space-y-1">{renderedElements}</div>;
}

/**
 * Normalizes raw LLM response to ensure lists, punctuation and tables
 * break cleanly into dedicated rows instead of collapsing onto a single line.
 */
function normalizeMarkdown(raw: string): string {
  if (!raw) return '';
  let text = raw.replace(/\r\n/g, '\n');

  // 1. Ensure table start on fresh line if glued to text: 'teks: | No |' -> 'teks:\n\n| No |'
  text = text.replace(/([^\n])\s*(\|[^\n]+\|\n\s*\|[-:\s|]+\|)/g, '$1\n\n$2');

  // 2. Separate trailing text after table row's last pipe:
  // e.g. '| 1 | Tersedia | **Ringkasan:**' -> '| 1 | Tersedia |\n\n**Ringkasan:**'
  const rawLines = text.split('\n');
  const cleanedLines: string[] = [];
  for (const l of rawLines) {
    if (l.trim().startsWith('|')) {
      const lastPipe = l.lastIndexOf('|');
      if (lastPipe > 0) {
        const tail = l.slice(lastPipe + 1).trim();
        if (tail) {
          cleanedLines.push(l.slice(0, lastPipe + 1));
          cleanedLines.push('');
          cleanedLines.push(tail);
          continue;
        }
      }
    }
    cleanedLines.push(l);
  }

  // 3. Process line-by-line: STRICTLY protect table rows (|...) and code/chart blocks (```) from splitting regexes!
  const processedLines: string[] = [];
  let inCode = false;
  for (const line of cleanedLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCode = !inCode;
      processedLines.push(line);
      continue;
    }
    // NEVER apply bullet or numbered list splitting regexes to code block lines or table rows
    if (inCode || trimmed.startsWith('|')) {
      processedLines.push(line);
      continue;
    }

    let l = line;
    // Separate numbered list starting right after punctuation or colon (e.g. "membahas: 1. Poin" -> "membahas:\n\n1. Poin")
    l = l.replace(/([:;!?])\s*(\d+\.\s+)/g, '$1\n\n$2');
    // Separate bullet lists after punctuation or colon (e.g. "poin: - satu" -> "poin:\n\n- satu")
    l = l.replace(/([:;!?])\s*([\-*]\s+)/g, '$1\n\n$2');

    processedLines.push(l);
  }
  text = processedLines.join('\n');

  // 4. Separate download links onto their own lines if glued to surrounding text
  text = text.replace(/([^\n])\s*(\[[^\]]+\]\s*\((?:https?:\/\/[^\s)]+|\/static\/[^\s)]+|\.[a-z0-9]+[^\s)]*)\))/gi, '$1\n\n$2');
  text = text.replace(/(\[[^\]]+\]\s*\((?:https?:\/\/[^\s)]+|\/static\/[^\s)]+|\.[a-z0-9]+[^\s)]*)\))\s*([^\n])/gi, '$1\n\n$2');

  // 5. Convert all localhost / 127.0.0.1 backend URLs directly to http://localhost:8000
  text = text.replace(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/gi, 'http://localhost:8000');
  text = text.replace(/https?:\/\/alesha\.djalu\.co\.id\/static\//gi, 'http://localhost:8000/static/');

  return text;
}

/**
 * Resolves URLs from Alesha AI: converts localhost / 127.0.0.1 or relative /static/ paths
 * directly to backend domain http://localhost:8000
 */
function resolveAleshaLink(url: string): string {
  if (!url) return '';
  let resolved = url.trim();

  // If starts with /static/, route directly to Alesha backend domain (http://localhost:8000)
  if (resolved.startsWith('/static/')) {
    return `http://localhost:8000${resolved}`;
  }

  // Convert any localhost or 127.0.0.1 URL directly to http://localhost:8000
  resolved = resolved.replace(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i, 'http://localhost:8000');

  // Fix any static paths pointing to alesha.djalu.co.id/static/ to alesha-be.djalu.co.id/static/
  resolved = resolved.replace(/^https?:\/\/alesha\.djalu\.co\.id\/static\//i, 'http://localhost:8000/static/');

  return resolved;
}

function renderInformativeTable(tableRows: string[][], key: string | number) {
  if (!tableRows || tableRows.length === 0) return null;
  const header = tableRows[0];
  const body = tableRows.slice(1);

  return (
    <div key={key} className="my-3.5 rounded-2xl border border-slate-200/90 overflow-hidden shadow-2xs bg-white">
      {/* Table Header Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-900 text-white px-3.5 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="text-xs font-semibold tracking-wide text-slate-100">Ringkasan Data & Informasi</span>
        </div>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-blue-200 border border-white/10">
          {body.length} baris
        </span>
      </div>

      {/* Table Body Container */}
      <div className="overflow-x-auto max-w-full">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-slate-100/95 text-slate-900 font-bold border-b border-slate-200 text-[11px] uppercase tracking-wider">
            <tr>
              {header.map((h, hIdx) => (
                <th key={hIdx} className="py-2.5 px-3 border-r last:border-r-0 border-slate-200/80 whitespace-nowrap">
                  {parseInlineFormatting(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {body.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-brand-50 dark:bg-brand-900/30/40 transition-colors odd:bg-white even:bg-slate-50/50">
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="py-2.5 px-3 border-r last:border-r-0 border-slate-200/60 text-slate-700">
                    {renderTableCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Intelligent cell formatter that renders badges for status / metrics
 */
function renderTableCell(cell: string): React.ReactNode {
  const trimmed = cell.trim();
  const lower = trimmed.toLowerCase();

  // Status Success / Completed
  if (['aktif', 'active', 'selesai', 'lulus', 'sukses', 'lengkap', 'terverifikasi', 'online'].includes(lower)) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
        {trimmed}
      </span>
    );
  }

  // Status Pending / Warning
  if (['pending', 'proses', 'berjalan', 'menunggu', 'draft'].includes(lower)) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
        {trimmed}
      </span>
    );
  }

  // Status Danger / Inactive
  if (['nonaktif', 'gagal', 'belum', 'tidak aktif', 'batal'].includes(lower)) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
        {trimmed}
      </span>
    );
  }

  // Percentage Values (e.g. 100%, 85%)
  if (/^\d+(\.\d+)?%$/.test(trimmed)) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800">
        {trimmed}
      </span>
    );
  }

  return parseInlineFormatting(trimmed);
}

/**
 * Parser format inline: **bold**, *italic*, `code`, [link](url)
 */
function parseInlineFormatting(text: string): React.ReactNode {
  if (!text) return '';

  // Match bold (**...**), inline code (`...`), italic (*...*), or standard markdown links [text](url)
  const parts = text.split(/(\*\*[^*]+?\*\*|`[^`]+?`|\*[^*]+?\*|\[[^\]]+\]\s*\([^)\s]+\))/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={index} className="font-bold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code key={index} className="px-1.5 py-0.5 bg-slate-200/90 text-slate-800 rounded font-mono text-[11px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={index} className="italic text-slate-800">
          {part.slice(1, -1)}
        </em>
      );
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\s*\(([^)\s]+)\)$/);
    if (linkMatch) {
      const linkText = linkMatch[1];
      const href = resolveAleshaLink(linkMatch[2]);
      return (
        <a
          key={index}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-700 dark:text-brand-400 hover:text-blue-800 underline font-medium inline-flex items-center gap-1"
        >
          {linkText}
        </a>
      );
    }

    return part;
  });
}

/**
 * Detects Document download links (Word, Excel, CSV, PDF, PowerPoint, etc.)
 * and renders high-visibility, attractive, dedicated Card UIs tailored to each file type.
 */
function parseDocumentDownloadCard(line: string, key: string | number): React.ReactNode | null {
  // Matches markdown link with optional whitespace between ] and (: [Title] (url) or [Title](url)
  const match = line.match(/\[([^\]]+)\]\s*\(([^)\s]+)\)/i);
  if (!match) return null;

  const rawLabel = match[1].trim();
  const fileUrl = resolveAleshaLink(match[2].trim());
  const lowerLabel = rawLabel.toLowerCase();
  const lowerUrl = fileUrl.toLowerCase();

  // Check if this link is a file or document download link
  const isDocLink =
    lowerUrl.includes('/static/exports/') ||
    /\.(pdf|docx?|xlsx?|csv|pptx?|zip|rar|tar|gz|txt)(?:\?|#|$)/i.test(lowerUrl) ||
    /(?:unduh|download|dokumen|berkas|file|rekapitulasi|laporan|export)/i.test(lowerLabel);

  if (!isDocLink) return null;

  // Determine file type category
  type FileCategory = 'word' | 'excel' | 'csv' | 'pdf' | 'pptx' | 'file';
  let category: FileCategory = 'file';

  if (/\.docx?(?:\?|#|$)/i.test(lowerUrl) || /(?:word|docx?)/i.test(lowerLabel)) {
    category = 'word';
  } else if (/\.xlsx?(?:\?|#|$)/i.test(lowerUrl) || /(?:excel|xlsx?|spreadsheet|lembar\s*kerja)/i.test(lowerLabel)) {
    category = 'excel';
  } else if (/\.csv(?:\?|#|$)/i.test(lowerUrl) || /csv/i.test(lowerLabel)) {
    category = 'csv';
  } else if (/\.pdf(?:\?|#|$)/i.test(lowerUrl) || /pdf/i.test(lowerLabel)) {
    category = 'pdf';
  } else if (/\.pptx?(?:\?|#|$)/i.test(lowerUrl) || /(?:powerpoint|pptx?|presentasi|paparan)/i.test(lowerLabel)) {
    category = 'pptx';
  }

  // Clean document title for display
  let docTitle = rawLabel
    .replace(/^(?:unduh|download)\s+(?:dokumen|file|berkas)?\s*(?:word|docx?|excel|xlsx?|spreadsheet|csv|pdf|pptx?|powerpoint)?\s*[:\-–—]?\s*/i, '')
    .replace(/^(?:dokumen|file|berkas)\s+(?:word|docx?|excel|xlsx?|spreadsheet|csv|pdf|pptx?|powerpoint)?\s*[:\-–—]?\s*/i, '')
    .trim();

  if (!docTitle) {
    docTitle = rawLabel;
  }

  // Styling and configuration per file format
  const configs: Record<FileCategory, {
    badgeText: string;
    badgeBg: string;
    cardBg: string;
    cardBorder: string;
    btnBg: string;
    btnText: string;
    subtitle: string;
  }> = {
    word: {
      badgeText: 'DOCX',
      badgeBg: 'bg-gradient-to-br from-blue-600 to-indigo-700',
      cardBg: 'bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-slate-50',
      cardBorder: 'border-brand-200 dark:border-brand-800/40/90',
      btnBg: 'bg-brand-700 hover:bg-brand-800 active:scale-95',
      btnText: 'Unduh Word',
      subtitle: 'Dokumen Word SM-Sinau Siap Diunduh',
    },
    excel: {
      badgeText: 'XLSX',
      badgeBg: 'bg-gradient-to-br from-emerald-600 to-teal-700',
      cardBg: 'bg-gradient-to-r from-emerald-50/90 via-teal-50/70 to-slate-50',
      cardBorder: 'border-emerald-200/90',
      btnBg: 'bg-emerald-600 hover:bg-emerald-700 active:scale-95',
      btnText: 'Unduh Excel',
      subtitle: 'Spreadsheet Excel SM-Sinau Siap Diunduh',
    },
    csv: {
      badgeText: 'CSV',
      badgeBg: 'bg-gradient-to-br from-teal-600 to-cyan-700',
      cardBg: 'bg-gradient-to-r from-teal-50/90 via-cyan-50/70 to-slate-50',
      cardBorder: 'border-teal-200/90',
      btnBg: 'bg-teal-600 hover:bg-teal-700 active:scale-95',
      btnText: 'Unduh CSV',
      subtitle: 'Format Data CSV SM-Sinau Siap Diunduh',
    },
    pdf: {
      badgeText: 'PDF',
      badgeBg: 'bg-gradient-to-br from-red-600 to-rose-700',
      cardBg: 'bg-gradient-to-r from-red-50/90 via-rose-50/70 to-slate-50',
      cardBorder: 'border-red-200/90',
      btnBg: 'bg-red-600 hover:bg-red-700 active:scale-95',
      btnText: 'Unduh PDF',
      subtitle: 'Dokumen Resmi SM-Sinau Siap Diunduh',
    },
    pptx: {
      badgeText: 'PPTX',
      badgeBg: 'bg-gradient-to-br from-orange-600 to-amber-700',
      cardBg: 'bg-gradient-to-r from-orange-50/90 via-amber-50/70 to-slate-50',
      cardBorder: 'border-orange-200/90',
      btnBg: 'bg-orange-600 hover:bg-orange-700 active:scale-95',
      btnText: 'Unduh PPT',
      subtitle: 'Paparan Presentasi SM-Sinau Siap Diunduh',
    },
    file: {
      badgeText: 'FILE',
      badgeBg: 'bg-gradient-to-br from-slate-700 to-indigo-800',
      cardBg: 'bg-gradient-to-r from-slate-50/90 via-indigo-50/40 to-slate-50',
      cardBorder: 'border-slate-200/90',
      btnBg: 'bg-slate-800 hover:bg-slate-900 active:scale-95',
      btnText: 'Unduh Berkas',
      subtitle: 'Berkas Dokumen SM-Sinau Siap Diunduh',
    },
  };

  const config = configs[category];

  // Check if line has text before or after the markdown link
  const beforeText = line.slice(0, match.index).trim();
  const afterText = line.slice((match.index || 0) + match[0].length).trim();

  return (
    <div key={key} className="my-2 space-y-1.5">
      {beforeText && (
        <p className="text-slate-800 leading-relaxed text-[12.5px]">
          {parseInlineFormatting(beforeText)}
        </p>
      )}

      <div
        className={`my-3 p-4 rounded-2xl ${config.cardBg} border ${config.cardBorder} shadow-2xs hover:shadow-xs transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl ${config.badgeBg} text-white flex items-center justify-center font-bold text-xs shadow-xs flex-shrink-0 group-hover:scale-105 transition-transform tracking-wider`}
          >
            {config.badgeText}
          </div>
          <div>
            <div className="font-bold text-slate-900 text-xs sm:text-[13px] leading-snug">
              {docTitle}
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {config.subtitle}
            </div>
          </div>
        </div>
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          download
          className={`px-4 py-2 rounded-xl ${config.btnBg} text-white text-xs font-semibold shadow-xs flex items-center gap-2 transition-all cursor-pointer flex-shrink-0`}
        >
          <Download className="w-3.5 h-3.5" />
          {config.btnText}
        </a>
      </div>

      {afterText && (
        <p className="text-slate-800 leading-relaxed text-[12.5px]">
          {parseInlineFormatting(afterText)}
        </p>
      )}
    </div>
  );
}


/**
 * Downloads a DOM element (containing an SVG chart) as a high-resolution PNG image
 * with SM-Sinau official branding banner.
 */
/**
 * Helper to draw rounded rectangle on Canvas 2D
 */


export const AiChatSinauModal: React.FC<AiChatSinauProps> = ({
  isOpen = false,
  isFullPage = false,
  onClose,
  activeMenu = 'Dashboard Akademik & Pembelajaran',
  activeFilters,
  selectedAsset,
  currentUser,
  activeRole,
  pageContext,
}) => {
  const isPortal = pageContext === 'portal' || (typeof window !== 'undefined' && window.location.pathname.includes('/portal'));
  const isWelcome = pageContext === 'welcome' || (typeof window !== 'undefined' && window.location.pathname.includes('/welcome'));
  const isUserUmum = String(activeRole || '').toUpperCase() === 'USER_UMUM' || (!currentUser && (isPortal || isWelcome));
  const effectiveRole = String(activeRole || currentUser?.role || currentUser?.roles?.[0] || (isUserUmum ? 'USER_UMUM' : 'GURU')).toUpperCase();
  const effectiveUserName = currentUser?.full_name || currentUser?.fullName || currentUser?.nama || currentUser?.name || currentUser?.username || (isUserUmum ? 'Pengunjung Umum' : 'Pengguna SM-Sinau');
  const effectiveUnit = currentUser?.tenant?.name || currentUser?.unit || 'SM-Sinau';
  const effectiveRank = currentUser?.rank || '';
  const effectiveNrp = currentUser?.nisn || currentUser?.nuptk || currentUser?.nip || currentUser?.nrp || '';

  // User scope identification for strict per-user chat session & history isolation
  const userScope = useMemo(() => {
    if (currentUser?.id) return `usr_${currentUser.id}`;
    if (currentUser?.username) return `usr_${currentUser.username}`;
    return isUserUmum ? 'visitor' : 'guest';
  }, [currentUser?.id, currentUser?.username, isUserUmum]);

  const storageKeys = useMemo(() => ({
    sessions: `sm_sinau_ai_sessions_${userScope}`,
    activeSession: `sm_sinau_ai_active_session_id_${userScope}`,
    messages: (sId: string) => `sm_sinau_ai_messages_${userScope}_${sId}`,
  }), [userScope]);

  // Helper to load sessions specifically for current user
  const loadUserSessions = useCallback((uScope: string, uId: string): AiChatSession[] => {
    try {
      const uKey = `sm_sinau_ai_sessions_${uScope}`;
      const saved = localStorage.getItem(uKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      // Migrate legacy sessions ONLY if they specifically match this user's ID or username
      const legacy = localStorage.getItem('sm_sinau_ai_sessions');
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy);
        if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
          const isDimas = uId === '583ab4c1-5a1d-4998-abcf-1b992b770ddc' || uScope.includes('guru.dimas');
          const userLegacy = parsedLegacy.filter((s: any) => s.userId === uId || (isDimas && (!s.userId || s.userId === 'usr_sinau')));
          if (userLegacy.length > 0) {
            localStorage.setItem(uKey, JSON.stringify(userLegacy));
            return userLegacy;
          }
        }
      }
    } catch { }
    const initSess: AiChatSession = {
      id: `sinau_${uScope}_${Date.now()}`,
      userId: uId || 'usr_sinau',
      title: 'Konsultasi Akademik & Pembelajaran',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return [initSess];
  }, []);

  // Helper to load messages for a specific session
  const loadSessionMessages = useCallback((uScope: string, sId: string): ChatMessage[] => {
    try {
      const saved = localStorage.getItem(`sm_sinau_ai_messages_${uScope}_${sId}`)
        || localStorage.getItem(`sm_sinau_ai_messages_${sId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch { }
    return [];
  }, []);

  // Sessions Management matching SM-Sinau (strictly isolated per logged-in user)
  const [sessions, setSessions] = useState<AiChatSession[]>(() =>
    loadUserSessions(userScope, currentUser?.id || 'usr_sinau')
  );

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const saved = localStorage.getItem(storageKeys.activeSession);
    const initialSessions = loadUserSessions(userScope, currentUser?.id || 'usr_sinau');
    if (saved && initialSessions.some((s: AiChatSession) => s.id === saved)) {
      return saved;
    }
    return initialSessions[0]?.id || `sinau_${userScope}_${Date.now()}`;
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const savedActive = localStorage.getItem(storageKeys.activeSession);
    const initialSessions = loadUserSessions(userScope, currentUser?.id || 'usr_sinau');
    const sId = (savedActive && initialSessions.some((s: AiChatSession) => s.id === savedActive))
      ? savedActive
      : initialSessions[0]?.id;
    return sId ? loadSessionMessages(userScope, sId) : [];
  });

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Array<{ name: string; type: string; size: number; base64: string }>>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceNote, setVoiceNote] = useState<{ base64: string; duration: number } | null>(null);
  const [expandedChart, setExpandedChart] = useState<any>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<any>(null);

  const aleshaApiBase = (import.meta as any).env?.VITE_ALESHA_API_URL || 'http://localhost:8000';

  // Synchronize state when logged-in user changes
  useEffect(() => {
    const currentSessions = loadUserSessions(userScope, currentUser?.id || 'usr_sinau');
    setSessions(currentSessions);
    const savedActive = localStorage.getItem(storageKeys.activeSession);
    const targetActiveId = (savedActive && currentSessions.some((s: AiChatSession) => s.id === savedActive))
      ? savedActive
      : (currentSessions[0]?.id || `sinau_${userScope}_${Date.now()}`);
    setActiveSessionId(targetActiveId);
    setMessages(loadSessionMessages(userScope, targetActiveId));
  }, [userScope, currentUser?.id, storageKeys.activeSession, loadUserSessions, loadSessionMessages]);

  // Persist sessions per user
  useEffect(() => {
    try {
      localStorage.setItem(storageKeys.sessions, JSON.stringify(sessions));
      localStorage.setItem(storageKeys.activeSession, activeSessionId);
      localStorage.setItem('sm_sinau_ai_session_id', activeSessionId);
    } catch { }
  }, [sessions, activeSessionId, storageKeys]);

  // Persist messages for active session per user
  useEffect(() => {
    if (activeSessionId) {
      try {
        localStorage.setItem(storageKeys.messages(activeSessionId), JSON.stringify(messages));
      } catch { }
    }
  }, [messages, activeSessionId, storageKeys]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isOpen || isFullPage) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isOpen, isFullPage]);

  // Handle switching session
  const handleSelectSession = (sId: string) => {
    setActiveSessionId(sId);
    setMessages(loadSessionMessages(userScope, sId));
  };

  // Handle creating new session
  const handleCreateNewSession = () => {
    const newId = `sinau_${userScope}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newSession: AiChatSession = {
      id: newId,
      userId: currentUser?.id || 'usr_sinau',
      title: 'Percakapan Baru',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [newSession, ...sessions];
    setSessions(updated);
    setActiveSessionId(newId);
    setMessages([]);
    localStorage.setItem(storageKeys.sessions, JSON.stringify(updated));
    localStorage.setItem(storageKeys.activeSession, newId);
    localStorage.setItem('sm_sinau_ai_session_id', newId);
  };

  // Handle deleting session
  const handleDeleteSession = (sId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Apakah Anda yakin ingin menghapus sesi percakapan ini?')) return;
    const remaining = sessions.filter((s) => s.id !== sId);
    localStorage.removeItem(storageKeys.messages(sId));
    localStorage.removeItem(`sm_sinau_ai_messages_${sId}`);
    setSessions(remaining);
    localStorage.setItem(storageKeys.sessions, JSON.stringify(remaining));
    if (activeSessionId === sId) {
      if (remaining.length > 0) {
        handleSelectSession(remaining[0].id);
      } else {
        handleCreateNewSession();
      }
    }
  };

  // Copy message text
  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Role-based quick prompts tailored for all 15 SM-Sinau roles
  const quickPrompts = useMemo(() => {
    let role = (effectiveRole || '').toUpperCase().trim();
    if (role.includes('SUPER')) role = 'SUPER_ADMIN';
    else if (role.includes('SEKOLAH') || role === 'ADMIN') role = 'ADMIN_SEKOLAH';
    else if (role.includes('KEPSEK') || role.includes('KEPALA')) role = 'KEPSEK';
    else if (role.includes('WAKE') || role.includes('WAKIL')) role = 'WAKEPSEK';
    else if (role.includes('PRODI') || role.includes('JURUSAN')) role = 'KAPRODI';
    else if (role.includes('GURU') || role.includes('TEACHER')) role = 'GURU';
    else if (role.includes('STAF') || role.includes('STAFF') || role.includes('TU')) role = 'STAF';
    else if (role.includes('BK') || role.includes('KONSELING')) role = 'BK';
    else if (role.includes('KEUANGAN') || role.includes('BENDAHARA')) role = 'KEUANGAN';
    else if (role.includes('AUDIT')) role = 'AUDITOR';
    else if (role.includes('CALON')) role = 'CALON_SISWA';
    else if (role.includes('WALI') || role.includes('ORANG_TUA') || role.includes('PARENT')) role = 'WALI_MURID';
    else if (role.includes('SISWA') || role.includes('STUDENT') || role.includes('MURID')) role = 'SISWA';
    else if (role.includes('INDUSTRI') || role.includes('DU_DI')) role = 'PEMBIMBING_INDUSTRI';
    else if (role.includes('PENGUJI') || role.includes('ASESOR')) role = 'PENGUJI_EKSTERNAL';

    switch (role) {
      case 'USER_UMUM': {
        const isPortalPage = isPortal || (typeof window !== 'undefined' && window.location.pathname.includes('/portal'));
        if (isPortalPage) {
          return [
            { label: '📚 Materi Publik Tersedia', prompt: 'Materi pelajaran umum apa saja yang tersedia di portal ini?' },
            { label: '🔍 Cara Mencari Bahan Ajar', prompt: 'Bagaimana cara mencari dan menyaring bahan ajar di portal publik ini?' },
            { label: '📖 Akses Gratis Materi', prompt: 'Apakah seluruh materi di portal ini gratis dan dapat diunduh tanpa login?' },
            { label: '💡 Ringkasan Materi', prompt: 'Bisa berikan panduan ringkas cara memanfaatkan materi umum di sini?' },
          ];
        }
        return [
          { label: '✨ Fitur Utama SINAU', prompt: 'Apa saja fitur dan keunggulan utama dari platform SINAU?' },
          { label: '📝 Sistem Ujian CBT Online', prompt: 'Bagaimana alur dan fitur ujian online CBT di SINAU?' },
          { label: '📊 Rapor Kurikulum Merdeka', prompt: 'Bagaimana sistem penilaian dan rapor Kurikulum Merdeka di SINAU?' },
          { label: '📱 Presensi & Portal Orang Tua', prompt: 'Bagaimana sistem absensi GPS/Face dan portal monitoring untuk wali murid?' },
        ];
      }

      case 'SUPER_ADMIN':
        return [
          { label: '📊 Statistik Multi-Tenant Sekolah', prompt: 'Tampilkan rekapitulasi jumlah sekolah aktif, total siswa, dan kapasitas server multi-tenant SM-Sinau.' },
          { label: '🛡️ Audit Log & Keamanan', prompt: 'Tampilkan rekap aktivitas audit log sistem, percobaan login gagal, dan event keamanan terbaru.' },
          { label: '💾 Alokasi & Kuota Penyimpanan', prompt: 'Berapa total penggunaan penyimpanan berkas materi pembelajaran dan kuota per sekolah?' },
          { label: '⚡ Kesehatan Platform & Database', prompt: 'Bagaimana status latency koneksi database db_sinau dan metrik performa API saat ini?' },
        ];

      case 'ADMIN_SEKOLAH':
        return [
          { label: '🏫 Ringkasan Profil & Data Sekolah', prompt: 'Tampilkan total jumlah guru, staf, siswa aktif, dan rombongan belajar (rombel) tahun ajaran berjalan.' },
          { label: '📅 Status Semester & Tahun Ajaran', prompt: 'Apakah semester dan tahun ajaran aktif sudah tervalidasi dan siap untuk distribusi rapor?' },
          { label: '👥 Rekapitulasi Presensi Hari Ini', prompt: 'Berapa persentase kehadiran siswa dan guru seluruh rombel di sekolah hari ini?' },
          { label: '📋 Kelengkapan Biodata Dapodik', prompt: 'Siswa atau tenaga pendidik mana saja yang biodatanya (NISN/NUPTK) masih belum lengkap?' },
        ];

      case 'KEPSEK':
        return [
          { label: '📈 Laporan Kemajuan Akademik', prompt: 'Tampilkan rekapitulasi tingkat kelulusan, rata-rata nilai ujian CBT, dan performa akademik sekolah.' },
          { label: '💰 Realisasi Anggaran & Penerimaan SPP', prompt: 'Berapa total penerimaan SPP bulan ini dan bagaimana persentase realisasi anggaran sekolah?' },
          { label: '👨‍🏫 Rekapitulasi Kehadiran Guru', prompt: 'Bagaimana tingkat kehadiran dan kedisiplinan mengajar para guru bulan ini?' },
          { label: '🏆 Prestasi & Kasus Kedisiplinan', prompt: 'Tampilkan capaian prestasi lomba siswa dan rekap status konseling/kedisiplinan siswa terkini.' },
        ];

      case 'WAKEPSEK':
        return [
          { label: '📚 Distribusi Beban Mengajar', prompt: 'Tampilkan beban jam mengajar per guru dan apakah ada guru dengan jam mengajar di luar batas regulasi.' },
          { label: '🗓️ Progres Kurikulum & Modul Ajar', prompt: 'Berapa persentase capaian target kurikulum dan modul ajar yang sudah diunggah oleh guru?' },
          { label: '📝 Kesiapan Ujian CBT & Bank Soal', prompt: 'Tampilkan jadwal asesmen/ujian CBT mendatang serta ketersediaan bank soal per mata pelajaran.' },
          { label: '📊 Rekap Presensi Per Tingkat / Jurusan', prompt: 'Tampilkan rekapitulasi kehadiran siswa per tingkat kelas dan jurusan minggu ini.' },
        ];

      case 'KAPRODI':
        return [
          { label: '🏭 Penempatan Siswa PKL / Magang', prompt: 'Tampilkan jumlah siswa kejuruan yang sedang magang/PKL dan persebaran mitra industri.' },
          { label: '🛠️ Kesiapan Bengkel & Lab Praktek', prompt: 'Bagaimana status ketersediaan sarana alat dan bahan praktikum kejuruan saat ini?' },
          { label: '📋 Jadwal Uji Kompetensi (UKK)', prompt: 'Tampilkan jadwal, asesor penguji, dan daftar siswa peserta sertifikasi UKK.' },
          { label: '💼 Evaluasi Pembimbing Industri', prompt: 'Tampilkan ringkasan feedback dan evaluasi kinerja siswa magang dari pembimbing industri.' },
        ];

      case 'GURU':
        return [
          { label: '📅 Jadwal Mengajar Hari Ini', prompt: 'Tampilkan jadwal mengajar kelas, mata pelajaran, dan jam pembelajaran saya hari ini.' },
          { label: '📝 Tugas Siswa Belum Dinilai', prompt: 'Tampilkan daftar tugas siswa yang sudah dikumpulkan namun belum saya berikan penilaian.' },
          { label: '📊 Rekap Nilai & Ketuntasan Kelas', prompt: 'Bagaimana rata-rata nilai kuis dan tugas siswa di kelas saya? Siapa saja yang butuh remedial?' },
          { label: '📋 Jurnal Presensi Kelas Saya', prompt: 'Tampilkan daftar siswa yang sering tidak hadir atau terlambat di kelas saya minggu ini.' },
        ];

      case 'STAF':
        return [
          { label: '⏱️ Rekap Kehadiran Staf & Tenaga Kependidikan', prompt: 'Tampilkan data absensi, keterlambatan, dan jam kerja staf tata usaha bulan ini.' },
          { label: '📦 Inventaris Sarana & Prasarana', prompt: 'Tampilkan daftar sarpras dan inventaris sekolah yang berkondisi rusak atau butuh pemeliharaan.' },
          { label: '📖 Sirkulasi Peminjaman Perpustakaan', prompt: 'Berapa buku perpustakaan yang sedang dipinjam dan buku mana yang melewati batas tempo kembali?' },
          { label: '📄 Permohonan Surat Keterangan Siswa', prompt: 'Tampilkan daftar permohonan surat keterangan aktif sekolah yang belum diproses.' },
        ];

      case 'BK':
        return [
          { label: '📋 10 Siswa Poin Pelanggaran Tertinggi', prompt: 'Tampilkan 10 siswa dengan akumulasi poin pelanggaran tata tertib tertinggi saat ini.' },
          { label: '🤝 Jadwal Konseling Siswa', prompt: 'Tampilkan jadwal janji temu bimbingan konseling dan tindak lanjut siswa minggu ini.' },
          { label: '🎯 Pemetaan Karir & Peminatan', prompt: 'Bagaimana pemetaan peminatan karir dan kelanjutan studi siswa kelas akhir?' },
          { label: '💡 Siswa Butuh Pemanggilan Wali', prompt: 'Daftar siswa mana saja yang membutuhkan panggilan orang tua/wali terkait kedisiplinan dan absensi?' },
        ];

      case 'KEUANGAN':
        return [
          { label: '💰 Rekap Penerimaan SPP Bulan Ini', prompt: 'Tampilkan total penerimaan tagihan SPP bulan ini dan persentase ketercapaian target.' },
          { label: '📊 Diagram Status Tagihan Siswa', prompt: 'Buatkan diagram pie status pembayaran SPP siswa (Lunas, Sebagian, Belum Lunas).' },
          { label: '⚠️ Daftar Siswa Menunggak SPP', prompt: 'Tampilkan daftar siswa dengan tunggakan pembayaran SPP lebih dari 2 bulan.' },
          { label: '🏦 Mutasi Kas & Rekonsiliasi Bank', prompt: 'Tampilkan ringkasan mutasi kas sekolah dan verifikasi transaksi transfer bank terbaru.' },
        ];

      case 'AUDITOR':
        return [
          { label: '🔍 Laporan Audit Arus Kas & BOS', prompt: 'Tampilkan ringkasan audit penerimaan kas, realisasi dana BOS, dan pengeluaran operasional.' },
          { label: '📑 Rekonsiliasi Gateway & Kas Bank', prompt: 'Apakah terdapat selisih transaksi antara gateway pembayaran online dengan kas bank sekolah?' },
          { label: '🏷️ Audit Fisik Sarpras & Inventaris', prompt: 'Tampilkan daftar inventaris aset sekolah, nomor registrasi, dan nilai penyusutan aset.' },
          { label: '⚖️ Kepatuhan Jurnal & Standar Akuntansi', prompt: 'Tampilkan rekapitulasi kepatuhan pencatatan jurnal transaksi terhadap pedoman APBS.' },
        ];

      case 'SISWA':
        return [
          { label: '📅 Jadwal Pelajaran Hari Ini', prompt: 'Tampilkan jadwal mata pelajaran, ruang kelas, dan nama guru pengampu saya hari ini.' },
          { label: '⏳ Tugas Mendekati Deadline', prompt: 'Tugas sekolah apa saja yang mendekati batas waktu pengumpulan dalam minggu ini?' },
          { label: '📊 Nilai Ujian & Rapor Sementara', prompt: 'Tampilkan ringkasan nilai tugas, kuis, dan ujian saya untuk semester aktif.' },
          { label: '📖 Materi Pembelajaran & E-Book', prompt: 'Tampilkan modul materi pelajaran terbaru yang diunggah guru dan e-book yang relevan.' },
        ];

      case 'WALI_MURID':
        return [
          { label: '👦 Rekap Kehadiran Anak Saya', prompt: 'Bagaimana catatan presensi kehadiran anak saya di sekolah bulan ini? Apakah ada absensi tanpa keterangan?' },
          { label: '📝 Perkembangan Nilai & Rapor Anak', prompt: 'Tampilkan perkembangan nilai tugas, ujian tengah semester, dan nilai rapor anak saya.' },
          { label: '💳 Status Tagihan SPP & Pembayaran', prompt: 'Berapa tagihan SPP anak saya yang belum dibayar beserta petunjuk cara pembayarannya?' },
          { label: '📢 Pengumuman & Agenda Penting Sekolah', prompt: 'Apa saja agenda kegiatan sekolah dan pengumuman resmi penting untuk orang tua murid?' },
        ];

      case 'CALON_SISWA':
        return [
          { label: '📝 Status Verifikasi Berkas PPDB', prompt: 'Bagaimana status verifikasi berkas formulir pendaftaran PPDB saya? Apakah sudah lengkap?' },
          { label: '📅 Jadwal Pengumuman & Tes Seleksi', prompt: 'Kapan jadwal pelaksanaan tes seleksi masuk dan pengumuman hasil kelulusan seleksi PPDB?' },
          { label: '🎯 Informasi Jalur Pendaftaran & Kuota', prompt: 'Tampilkan informasi kuota dan syarat pendaftaran masing-masing jalur (Zonasi, Prestasi, Afirmasi).' },
          { label: '💳 Biaya & Petunjuk Daftar Ulang', prompt: 'Tampilkan rincian biaya pendaftaran serta petunjuk pembayaran daftar ulang calon siswa baru.' },
        ];

      case 'PEMBIMBING_INDUSTRI':
        return [
          { label: '👷 Daftar Siswa Bimbingan Magang', prompt: 'Tampilkan daftar siswa SMK yang sedang melaksanakan prakerin/PKL di industri kami.' },
          { label: '📓 Verifikasi Jurnal Harian Magang', prompt: 'Tampilkan jurnal harian kegiatan siswa magang yang memerlukan verifikasi dan paraf pembimbing.' },
          { label: '📊 Input Nilai & Evaluasi Kompetensi', prompt: 'Tampilkan rubrik penilaian kinerja, kedisiplinan, dan kompetensi teknis siswa magang.' },
          { label: '⚠️ Laporan Presensi Prakerin', prompt: 'Apakah ada siswa magang yang tidak hadir atau izin kerja dalam minggu ini?' },
        ];

      case 'PENGUJI_EKSTERNAL':
        return [
          { label: '🎯 Jadwal Pengujian UKK Siswa', prompt: 'Tampilkan jadwal asesmen dan daftar siswa yang akan saya uji pada Uji Kompetensi Keahlian (UKK).' },
          { label: '📑 Rubrik Standar Penilaian Asesor', prompt: 'Tampilkan kriteria standar penilaian dan skema sertifikasi kejuruan yang diujikan.' },
          { label: '✏️ Status Input Skor Asesmen', prompt: 'Berapa siswa yang sudah dinilai dan berapa peserta yang masih belum diinput nilainya?' },
          { label: '🏆 Rekapitulasi Kelulusan Asesmen', prompt: 'Tampilkan ringkasan hasil kelulusan dan predikat kompeten para peserta UKK.' },
        ];

      default:
        return [
          { label: '📅 Jadwal Kegiatan Sekolah Hari Ini', prompt: 'Tampilkan jadwal KBM dan agenda kegiatan sekolah yang berlangsung hari ini.' },
          { label: '📊 Rekapitulasi Data Siswa & Guru', prompt: 'Tampilkan ringkasan data siswa, rombel, dan guru yang aktif di sistem SM-Sinau.' },
          { label: '📝 Pengumuman & Berita Terbaru', prompt: 'Apa saja informasi, surat edaran, atau pengumuman penting terbaru di sekolah?' },
          { label: '💡 Panduan Fitur SM-Sinau', prompt: 'Jelaskan fitur-fitur utama sistem SM-Sinau yang dapat saya akses untuk peran saya.' },
        ];
    }
  }, [effectiveRole]);

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          setVoiceNote({
            base64: reader.result as string,
            duration: recordingSeconds,
          });
        };
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.warn('Microphone access denied:', err);
      alert('Tidak dapat mengakses mikrofon. Pastikan izin mikrofon telah diberikan di browser.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);
      setVoiceNote(null);
    }
  };

  // Multimodal file attachment
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.size > 15 * 1024 * 1024) {
        alert(`File ${file.name} melebihi batas 15MB`);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            base64: reader.result as string,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Send message
  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = (customPrompt ?? inputText).trim();
    if (!textToSend && attachments.length === 0 && !voiceNote) return;

    setErrorMsg(null);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sessionId: activeSessionId,
      role: 'user',
      content: textToSend || (voiceNote ? '[Pesan Suara Dikirim]' : '[Dokumen Terlampir]'),
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      attachments: attachments.map((a) => ({ name: a.name, type: a.type, size: a.size })),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    const currentAttachments = [...attachments];
    const currentVoice = voiceNote;
    setAttachments([]);
    setVoiceNote(null);
    setIsLoading(true);

    // Auto-update session title from first prompt
    if (messages.length === 0) {
      const cleanTitle = textToSend.replace(/^[^\w\s]+/, '').trim();
      const title = cleanTitle.length > 28 ? cleanTitle.substring(0, 28) + '...' : cleanTitle || 'Percakapan Akademik & Pembelajaran';
      setSessions((prev) => {
        const updated = prev.map((s) => (s.id === activeSessionId ? { ...s, title } : s));
        try {
          localStorage.setItem(storageKeys.sessions, JSON.stringify(updated));
        } catch { }
        return updated;
      });
    }

    try {
      let targetRoleCode = (effectiveRole || '').toLowerCase().trim();
      if (targetRoleCode.includes('super') || targetRoleCode.includes('sekolah') || targetRoleCode === 'admin') targetRoleCode = 'admin_sekolah';
      else if (targetRoleCode.includes('kepsek') || targetRoleCode.includes('kepala') || targetRoleCode.includes('wake')) targetRoleCode = 'kepsek';
      else if (targetRoleCode.includes('prodi') || targetRoleCode.includes('jurusan')) targetRoleCode = 'kaprodi';
      else if (targetRoleCode.includes('guru') || targetRoleCode.includes('teacher')) targetRoleCode = 'guru';
      else if (targetRoleCode.includes('bk') || targetRoleCode.includes('konseling')) targetRoleCode = 'bk';
      else if (targetRoleCode.includes('keuangan') || targetRoleCode.includes('bendahara')) targetRoleCode = 'keuangan';
      else if (targetRoleCode.includes('wali') || targetRoleCode.includes('orang_tua') || targetRoleCode.includes('parent')) targetRoleCode = 'wali_murid';
      else if (targetRoleCode.includes('industri') || targetRoleCode.includes('du_di')) targetRoleCode = 'pembimbing_industri';
      else if (targetRoleCode.includes('siswa') || targetRoleCode.includes('student') || targetRoleCode.includes('murid')) targetRoleCode = 'siswa';

      const payload: any = {
        message: textToSend,
        session_id: activeSessionId,
        user_role: effectiveRole,
        role: effectiveRole,
        target_role: targetRoleCode,
        user_unit: effectiveUnit,
        user_name: effectiveUserName,
        user_fullname: currentUser?.full_name || currentUser?.fullName || currentUser?.nama || currentUser?.name || effectiveUserName,
        full_name: currentUser?.full_name || currentUser?.fullName || currentUser?.nama || currentUser?.name || effectiveUserName,
        username: currentUser?.username || '',
        user_rank: effectiveRank,
        user_nrp: effectiveNrp,
        context_app: 'sm-sinau',
        user_category: 'sm-sinau',
        category_id: 'sm-sinau',
        current_menu: isUserUmum ? (isPortal ? 'Portal Materi Publik' : 'Landing Page & Pengenalan Fitur Sinau') : (activeMenu || 'Dashboard Akademik & Pembelajaran'),
        current_page: typeof window !== 'undefined' ? window.location.pathname : (isPortal ? '/portal' : '/welcome'),
        active_filters: activeFilters,
        selected_asset: selectedAsset
          ? {
            id: selectedAsset.id,
            name: selectedAsset.name,
            code: selectedAsset.code,
            category: selectedAsset.category,
            status: selectedAsset.status,
            brand: selectedAsset.brand,
          }
          : undefined,
      };

      if (currentAttachments.length > 0) {
        payload.attachments = currentAttachments.map((a) => ({
          name: a.name,
          type: a.type,
          size: a.size,
          data: a.base64,
        }));
      }

      if (currentVoice) {
        payload.audio = {
          data: currentVoice.base64,
          duration: currentVoice.duration,
        };
      }

      const res = await fetch(`${aleshaApiBase}/api/chat/sinau`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        const replyContent = data.reply || data.response || data.message || 'Data berhasil diproses.';
        const botMsg: ChatMessage = {
          id: `bot-${Date.now()}`,
          sessionId: activeSessionId,
          role: 'assistant',
          content: replyContent,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, botMsg]);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err: any) {
      console.warn('[AiChatSinau] Error connecting to Alesha AI:', err);
      const fallbackMsg: ChatMessage = {
        id: `bot-err-${Date.now()}`,
        sessionId: activeSessionId,
        role: 'assistant',
        content:
          'Siap, mohon maaf saat ini gateway engine Alesha AI sedang dalam proses sinkronisasi data. ' +
          'Silakan periksa koneksi ke server backend port 8000 atau ulangi pertanyaan Anda.',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen && !isFullPage) return null;

  const chatModuleLayout = (
    <div className="flex h-full w-full bg-slate-50 text-slate-800 overflow-hidden select-text">
      {/* Sessions Sidebar matching SM-Sinau */}
      {!isUserUmum && (
      <div className="w-80 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col shadow-xs">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-teal-700 to-emerald-600 flex items-center justify-center text-white shadow-sm shadow-brand-700/20">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 tracking-tight">Alesha AI Chat</h2>
                <p className="text-[11px] text-slate-500">Smart Academic & SIS Assistant</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Live
            </span>
          </div>

          <button
            onClick={handleCreateNewSession}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-xs font-semibold shadow-sm shadow-blue-600/30 transition-all active:scale-[0.99] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Sesi Percakapan Baru</span>
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar bg-slate-50/30">
          {sessions.length === 0 ? (
            <div className="text-center py-10 px-4 text-xs text-slate-400">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="font-medium text-slate-600">Belum ada riwayat percakapan</p>
              <p className="text-[11px] mt-1 text-slate-400">Mulai sesi baru untuk konsultasi data akademik, presensi, tugas & nilai.</p>
            </div>
          ) : (
            sessions.map((s) => {
              const isActive = s.id === activeSessionId;
              return (
                <div
                  key={s.id}
                  onClick={() => handleSelectSession(s.id)}
                  className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition cursor-pointer ${isActive
                    ? 'bg-brand-50 dark:bg-brand-900/30/90 text-brand-800 dark:text-brand-300 border border-brand-200 dark:border-brand-800/40 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-brand-700 dark:text-brand-400' : 'text-slate-400'}`} />
                    <span className="truncate">{s.title || 'Percakapan'}</span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteSession(s.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                    title="Hapus Sesi"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* User Context Footer */}
        <div className="p-3.5 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-600">
          <div className="flex items-center gap-2 mb-1.5">
            <Shield className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
            <span className="font-semibold text-slate-800 truncate">{effectiveUserName}</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="px-2 py-0.5 rounded bg-blue-100/80 text-brand-800 dark:text-brand-300 font-medium">
              {effectiveRole}
            </span>
            <span className="flex items-center gap-1 text-slate-500 truncate max-w-[130px]">
              <MapPin className="w-2.5 h-2.5 text-emerald-600" />
              <span className="truncate font-medium">{effectiveUnit}</span>
            </span>
          </div>
        </div>
      </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-slate-100/60 min-w-0">
        {/* Top Header matching SM-Sinau */}
        <div className={`px-6 py-3.5 flex items-center justify-between shadow-2xs shrink-0 ${
          isUserUmum
            ? 'bg-gradient-to-r from-brand-800 via-brand-700 to-accent-600 text-white border-b border-brand-600/30'
            : 'bg-white/90 backdrop-blur-md border-b border-slate-200 text-slate-900'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm ${
              isUserUmum ? 'bg-white/20 text-white' : 'bg-gradient-to-tr from-blue-600 via-brand-700 to-cyan-500 text-white shadow-brand-700/20'
            }`}>
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className={`text-sm font-bold flex items-center gap-2 ${isUserUmum ? 'text-white' : 'text-slate-900'}`}>
                {isUserUmum ? (isPortal ? 'Alesha AI — Pemandu Portal Materi' : 'Alesha AI — Panduan Fitur SINAU') : 'Alesha Intelligent Chat Mode'}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  isUserUmum ? 'bg-white/20 text-white border border-white/30' : 'bg-brand-50 text-brand-800 border border-brand-200'
                }`}>
                  {isUserUmum ? 'Pengunjung Umum' : 'SM-SINAU V2'}
                </span>
              </h1>
              <p className={`text-[11px] ${isUserUmum ? 'text-white/80' : 'text-slate-500'}`}>
                {isUserUmum 
                  ? (isPortal ? 'Eksplorasi bahan ajar terbuka dan materi pelajaran umum tanpa login' : 'Pemandu resmi pengenalan fitur platform, sistem ujian CBT & modul sekolah cerdas')
                  : `Asisten cerdas akademik, jadwal KBM, data siswa, presensi, tugas & ujian CBT, nilai, dan rekapitulasi SM-Sinau (${effectiveUnit})`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateNewSession}
              title="Percakapan Baru"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            {!isFullPage && onClose && (
              <button
                onClick={onClose}
                title="Tutup Chatbot"
                className={`p-2 rounded-xl transition cursor-pointer ${
                  isUserUmum ? 'text-white/80 hover:text-white hover:bg-white/10' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Live Context Awareness Strip */}
        <div className="px-6 py-2 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between text-xs text-slate-600 shrink-0">
          <div className="flex items-center gap-2 truncate">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-slate-700">Konteks Aktif:</span>
            <span className="text-brand-800 dark:text-brand-300 font-medium">{activeMenu}</span>
            {activeFilters?.category && (
              <span className="bg-white px-2 py-0.5 rounded border border-slate-200 text-[11px] font-medium text-slate-700">
                Kategori: {activeFilters.category}
              </span>
            )}
            {selectedAsset && (
              <span className="bg-brand-50 dark:bg-brand-900/30 text-brand-800 dark:text-brand-300 px-2 py-0.5 rounded border border-brand-200 dark:border-brand-800/40 text-[11px] font-medium">
                Aset: {selectedAsset.name}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400 shrink-0 hidden sm:inline">
            Akses: {effectiveRole}
          </span>
        </div>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto my-8 bg-white border border-slate-200/90 rounded-2xl p-8 shadow-sm text-center animate-in fade-in duration-300">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-teal-700 to-emerald-600 flex items-center justify-center text-white mx-auto mb-4 shadow-md shadow-brand-700/20">
                <Bot className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1.5">
                {isUserUmum ? (isPortal ? 'Selamat Datang di Portal Materi Publik!' : 'Selamat Datang di Platform SINAU!') : `Halo, ${effectiveUserName}!`}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
                {isUserUmum 
                  ? (isPortal 
                      ? 'Saya Alesha, pemandu belajar Anda. Anda dapat mengeksplorasi bahan ajar terbuka dan materi umum yang dibagikan oleh berbagai lembaga pendidikan di sini tanpa perlu login.'
                      : 'Saya Alesha, asisten virtual dan lapisan intelijen SINAU. Saya siap memperkenalkan seluruh fitur unggulan platform, mulai dari LMS, ujian online CBT, presensi GPS/Face, rapor Kurikulum Merdeka, hingga modul magang industri PKL.')
                  : 'Saya Alesha, asisten cerdas sistem SM-Sinau. Saya siap membantu menyajikan data akademik, rekapitulasi siswa, jadwal pelajaran, materi LMS, tugas & ujian CBT, nilai rapor, absensi, hingga rekapitulasi pembayaran SPP.'}
              </p>

              {/* Quick Prompts */}
              <div className="text-left">
                <p className="text-[11px] font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-brand-700 dark:text-brand-400" />
                  Rekomendasi Pertanyaan Cepat untuk Role {effectiveRole}:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {quickPrompts.map((qp, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(qp.prompt)}
                      className="text-left p-3.5 rounded-xl bg-slate-50 hover:bg-brand-50/50 dark:bg-brand-950/20 border border-slate-200 hover:border-brand-300 dark:border-brand-700 transition-all shadow-2xs group cursor-pointer"
                    >
                      <div className="text-xs font-semibold text-brand-700 dark:text-brand-400 group-hover:text-brand-800 dark:text-brand-300 mb-1">
                        {qp.label}
                      </div>
                      <div className="text-[11px] text-slate-500 line-clamp-2 leading-snug">
                        {qp.prompt}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div key={m.id} className={`flex gap-3 max-w-3xl ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
                  {/* Avatar */}
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-white shadow-xs ${isUser ? 'bg-brand-700' : 'bg-gradient-to-tr from-brand-700 to-blue-600'
                      }`}
                  >
                    {isUser ? <Shield className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>

                  {/* Bubble */}
                  <div
                    className={`relative rounded-2xl p-4 text-xs leading-relaxed max-w-xl ${isUser
                      ? 'bg-brand-700 text-white rounded-tr-none shadow-sm shadow-blue-600/10'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm'
                      }`}
                  >
                    {/* Message Content */}
                    {isUser ? (
                      <div className="whitespace-pre-wrap font-sans text-xs break-words leading-relaxed font-medium">
                        {m.content}
                      </div>
                    ) : (
                      <MarkdownViewer content={m.content} onExpandChart={setExpandedChart} />
                    )}

                    {/* Copy and Actions for Assistant */}
                    {!isUser && (
                      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 text-[10px] text-slate-400">
                        <span className="font-medium text-slate-400">Alesha AI • SM-Sinau</span>
                        <button
                          onClick={() => handleCopy(m.id, m.content)}
                          className="flex items-center gap-1 hover:text-slate-700 transition font-medium cursor-pointer"
                        >
                          {copiedId === m.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-600 font-semibold">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Salin Jawaban</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Typing Indicator */}
          {isLoading && (
            <div className="flex gap-3 max-w-xl mr-auto animate-pulse">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-700 to-blue-600 flex items-center justify-center text-white shadow-xs">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-3.5 flex items-center gap-2 text-xs text-slate-600 shadow-sm">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-50 dark:bg-brand-900/300 animate-bounce"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-50 dark:bg-brand-900/300 animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-50 dark:bg-brand-900/300 animate-bounce [animation-delay:0.4s]"></span>
                </span>
                <span className="font-medium">Alesha sedang memproses data SM-Sinau...</span>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 shadow-2xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-500" />
              <span className="font-medium">{errorMsg}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-white border-t border-slate-200 shadow-sm shrink-0">
          <div className="max-w-4xl mx-auto">
            {/* Active Attachment Previews */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2.5">
                {attachments.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-xs shadow-2xs"
                  >
                    <FileText className="w-3.5 h-3.5 text-brand-700 dark:text-brand-400" />
                    <span className="truncate max-w-[150px] font-medium">{file.name}</span>
                    <button
                      onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-rose-600 ml-1 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Active Voice Note Preview */}
            {voiceNote && (
              <div className="flex items-center gap-2 mb-2.5 p-2 rounded-xl bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-800/40 text-blue-800 text-xs">
                <Mic className="w-4 h-4 text-brand-700 dark:text-brand-400 animate-pulse" />
                <span className="font-medium">Rekaman Suara ({voiceNote.duration} detik) siap dikirim.</span>
                <button
                  onClick={() => setVoiceNote(null)}
                  className="ml-auto text-slate-400 hover:text-rose-600 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Live Recording Status */}
            {isRecording && (
              <div className="flex items-center justify-between p-2.5 mb-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs animate-pulse">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
                  <span className="font-semibold">Merekam Suara... ({recordingSeconds}s)</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={cancelRecording}
                    className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-medium cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={stopRecording}
                    className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[11px] flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    <Square className="w-3 h-3" />
                    <span>Selesai</span>
                  </button>
                </div>
              </div>
            )}

            {/* Main Input Controls */}
            <div className="relative flex items-center gap-2 bg-slate-50 rounded-2xl border border-slate-200 focus-within:border-brand-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 p-1.5 transition-all shadow-2xs">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
              {!isUserUmum && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Lampirkan Dokumen / Gambar"
                  className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition cursor-pointer"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                title={isRecording ? 'Berhenti Merekam' : 'Rekam Pesan Suara'}
                className={`p-2 rounded-xl transition cursor-pointer ${isRecording ? 'text-rose-600 bg-rose-100 animate-pulse' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60'
                  }`}
              >
                <Mic className="w-4 h-4" />
              </button>

              <textarea
                ref={textareaRef}
                rows={1}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tanyakan data akademik, jadwal KBM, nilai rapor, presensi, tugas, ujian CBT, atau tagihan SPP..."
                className="flex-1 bg-transparent border-0 text-slate-800 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-0 resize-none py-2 px-1 max-h-32 leading-normal"
              />

              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={isLoading || (!inputText.trim() && attachments.length === 0 && !voiceNote)}
                className="p-2.5 rounded-xl bg-brand-700 hover:bg-brand-800 disabled:opacity-40 disabled:hover:bg-brand-700 text-white shadow-sm shadow-blue-600/30 transition-all cursor-pointer flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[10px] text-slate-400 text-center mt-2 font-medium">
              Alesha AI terhubung dengan SM-Connect Data Gateway SINAU. Informasi disaring otomatis berdasarkan hak akses logistik Anda.
            </p>
          </div>
        </div>
      </div>

      {/* Lightbox Modal: Enlarge Visual Chart (Mounted via Portal) */}
      {expandedChart &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setExpandedChart(null)}
          >
            <div
              className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden text-slate-800 animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-700/30 border border-brand-500/40 flex items-center justify-center text-blue-400">
                    <BarChart2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      {expandedChart.title || 'Grafik Rekapitulasi Data Akademik & Pembelajaran'}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {expandedChart.subtitle || 'Visualisasi Terperinci Data Akademik SM-Sinau'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      downloadCapturedVisual(
                        document.getElementById('modal-infographic-capture'),
                        expandedChart,
                        expandedChart.title || 'grafik_akademik_sinau'
                      )
                    }
                    className="px-3.5 py-2 rounded-xl bg-brand-700 hover:bg-brand-50 dark:bg-brand-900/300 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition active:scale-95 cursor-pointer"
                    title="Unduh Gambar PNG Resolusi Tinggi"
                  >
                    <Download className="w-4 h-4" />
                    <span>Unduh Gambar (PNG)</span>
                  </button>
                  <button
                    onClick={() => setExpandedChart(null)}
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                    title="Tutup Modal"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar bg-[#F4F7FE]">
                <div id="modal-infographic-capture" className="p-4 sm:p-6 bg-[#F4F7FE] space-y-4 rounded-3xl">
                  {expandedChart.isMulti ? (
                    <AleshaMultiChartBoard
                      charts={expandedChart.charts}
                      title={expandedChart.title}
                      subtitle={expandedChart.subtitle}
                      isModal
                    />
                  ) : (
                    <>
                      <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
                        <AleshaChartViewer chartData={expandedChart} isModal />
                      </div>

                      {Array.isArray(expandedChart.data) && expandedChart.data.length > 0 && (
                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                          <div className="px-4 py-3 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-800">
                            <span>Tabel Rincian Data Akademik & Pembelajaran</span>
                            <span className="text-[11px] font-normal text-slate-500">
                              {expandedChart.data.length} kategori / data record
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] tracking-wider">
                                <tr>
                                  <th className="py-2.5 px-4">No</th>
                                  <th className="py-2.5 px-4">{expandedChart.xAxis || 'Kategori / Label'}</th>
                                  <th className="py-2.5 px-4 text-right">
                                    {expandedChart.yAxis || 'Kuantitas / Nilai'}
                                  </th>
                                  <th className="py-2.5 px-4 text-right">Persentase</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-700">
                                {(() => {
                                  const total = expandedChart.data.reduce(
                                    (acc: number, d: any) => acc + Number(d.value || d.count || 0),
                                    0
                                  );
                                  return expandedChart.data.map((item: any, idx: number) => {
                                    const val = Number(item.value || item.count || 0);
                                    const pct = total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '-';
                                    return (
                                      <tr key={idx} className="hover:bg-brand-50 dark:bg-brand-900/30/40">
                                        <td className="py-2.5 px-4 text-slate-400 font-medium">{idx + 1}</td>
                                        <td className="py-2.5 px-4 font-semibold text-slate-800 flex items-center gap-2">
                                          <span
                                            className="w-2.5 h-2.5 rounded-full inline-block"
                                            style={{ backgroundColor: item.color || '#2563eb' }}
                                          />
                                          {item.name || item.label}
                                        </td>
                                        <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                                          {val.toLocaleString('id-ID')}
                                        </td>
                                        <td className="py-2.5 px-4 text-right font-medium text-slate-600">{pct}</td>
                                      </tr>
                                    );
                                  });
                                })()}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );

  if (isFullPage) {
    return (
      <div className="w-full h-full flex flex-col animate-in fade-in duration-200">
        {chatModuleLayout}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-5xl h-[88vh] max-h-[820px] flex flex-col overflow-hidden text-slate-800 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {chatModuleLayout}
      </div>
    </div>
  );
};

export const AiChatSinauModule = AiChatSinauModal;
export default AiChatSinauModal;
