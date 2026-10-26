import { createWidget } from 'expo-widgets';
import {
  Box,
  Row,
  Column,
  Text,
  Button,
  Image,
  LinearProgressIndicator,
} from '@expo/ui/jetpack-compose';
import {
  padding,
  paddingAll,
  fillMaxSize,
  fillMaxWidth,
  size,
  background,
  cornerRadius,
} from '@expo/ui/jetpack-compose/modifiers';
import type { ProgressWidgetSnapshot } from '../shared/widget-snapshot';

export function ListProgressWidget(
  props: ProgressWidgetSnapshot,
  environment: { colorScheme?: 'light' | 'dark'; width?: number; height?: number }
) {
  'widget';
  const isDark = environment?.colorScheme !== 'light';
  const bg = isDark ? '#18181B' : '#FFFFFF';
  const cardBg = isDark ? '#27272A' : '#F4F4F5';
  const textPrimary = isDark ? '#F4F4F5' : '#18181B';
  const textMuted = isDark ? '#A1A1AA' : '#71717A';
  const accent = '#6366F1';
  // Ring colors match the web app's ProgressRing: slate-800/80 track, indigo-500 arc
  // and indigo-300 label (the web app is dark only; light mode uses slate-200 / indigo-600).
  const ringTrack = isDark ? '#CC1E293B' : '#E2E8F0';
  const ringLabel = isDark ? '#A5B4FC' : '#4F46E5';

  // Logged-out state
  if (!props?.isLoggedIn || !props?.listId) {
    return (
      <Column
        modifiers={[fillMaxSize(), paddingAll(12), background(bg), cornerRadius(16)]}
        horizontalAlignment="center"
        verticalArrangement="center"
      >
        <Text style={{ fontSize: 16, fontWeight: '800' }} color={textPrimary}>
          sYnX
        </Text>
        <Button
          target="open:synx://"
          colors={{ containerColor: accent, contentColor: '#FFFFFF' }}
          modifiers={[padding(12, 6, 12, 6), cornerRadius(8)]}
        >
          <Text style={{ fontSize: 12, fontWeight: 'bold' }} color="#FFFFFF">
            Open sYnX
          </Text>
        </Button>
      </Column>
    );
  }

  const height = environment?.height ?? 160;
  const isCompactStrip = height < 120;
  const progressPercent = Math.min(Math.max(Math.round(props.progressPercent || 0), 0), 100);
  const progressRatio = progressPercent / 100;

  // 2x1 Compact Strip Layout
  if (isCompactStrip) {
    return (
      <Row
        modifiers={[fillMaxSize(), paddingAll(10), background(bg), cornerRadius(16)]}
        verticalAlignment="center"
        horizontalArrangement="spaceBetween"
      >
        <Column modifiers={[padding(0, 0, 8, 0)]}>
          <Text style={{ fontSize: 13, fontWeight: 'bold' }} color={textPrimary} maxLines={1}>
            {props.listTitle || 'sYnX'}
          </Text>
          <Text style={{ fontSize: 11, fontWeight: '500' }} color={textMuted}>
            {`${props.doneCount}/${props.totalCount}`}
          </Text>
        </Column>

        <Box modifiers={[padding(4, 0, 8, 0)]}>
          <LinearProgressIndicator
            progress={progressRatio}
            color={accent}
            trackColor={ringTrack}
            modifiers={[size(90, 8), cornerRadius(4)]}
          />
        </Box>

        {props.canEdit ? (
          <Button
            target={`open:synx://list/${props.listId}?action=newTask`}
            colors={{ containerColor: accent, contentColor: '#FFFFFF' }}
            modifiers={[padding(8, 4, 8, 4), cornerRadius(8)]}
          >
            <Text style={{ fontSize: 11, fontWeight: 'bold' }} color="#FFFFFF">
              + Add
            </Text>
          </Button>
        ) : null}
      </Row>
    );
  }

  // 2x2 Square Progress Ring Layout
  // The web ring is 56px with an 11px label. Use the same size when the widget is
  // tall enough, shrinking (down to 40dp) on short widgets so the button still fits.
  const ringSize = Math.min(56, Math.max(40, Math.floor(height - 124)));
  const ringFontSize = Math.max(10, Math.round((ringSize * 13) / 56));

  return (
    <Column
      modifiers={[fillMaxSize(), paddingAll(12), background(bg), cornerRadius(16)]}
      horizontalAlignment="center"
      verticalArrangement="spaceBetween"
    >
      {/* Title */}
      <Button
        target={`open:synx://list/${props.listId}`}
        colors={{ containerColor: 'transparent', contentColor: textPrimary }}
      >
        <Text style={{ fontSize: 14, fontWeight: 'bold' }} color={textPrimary} maxLines={1}>
          {props.listTitle || 'sYnX'}
        </Text>
      </Button>

      {/* Progress ring, drawn like the web app's ring: a full background track,
          an arc from 12 o'clock running clockwise, and the percentage centered
          inside. Android widgets can't draw arcs, so the ring is a vector drawable
          per whole percent, generated at prebuild by plugins/withWidgetProgressRing.js. */}
      <Box modifiers={[size(ringSize, ringSize)]} contentAlignment="center">
        <Image
          source={{ uri: `synx_widget_ring_${isDark ? 'dark' : 'light'}_${progressPercent}` }}
          contentDescription={`${progressPercent}% complete`}
          modifiers={[size(ringSize, ringSize)]}
        />
        <Text
          style={{ fontSize: ringFontSize, fontWeight: 'bold' }}
          color={ringLabel}
          maxLines={1}
        >
          {`${progressPercent}%`}
        </Text>
      </Box>

      {/* Counts & Preview */}
      <Column horizontalAlignment="center">
        <Text style={{ fontSize: 11, fontWeight: '600' }} color={textMuted}>
          {`${props.doneCount} of ${props.totalCount} completed`}
        </Text>
        {props.nextTaskText ? (
          <Text
            style={{ fontSize: 10, fontWeight: '500' }}
            color={textMuted}
            maxLines={1}
            modifiers={[padding(0, 2, 0, 0)]}
          >
            {`Next: ${props.nextTaskText}`}
          </Text>
        ) : null}
      </Column>

      {/* Add Task Button */}
      {props.canEdit ? (
        <Button
          target={`open:synx://list/${props.listId}?action=newTask`}
          colors={{ containerColor: accent, contentColor: '#FFFFFF' }}
          modifiers={[fillMaxWidth(), padding(6, 6, 6, 6), cornerRadius(10)]}
        >
          <Text style={{ fontSize: 12, fontWeight: 'bold' }} color="#FFFFFF">
            + New Task
          </Text>
        </Button>
      ) : null}
    </Column>
  );
}

export const initialProgressSnapshot: ProgressWidgetSnapshot = {
  listId: '',
  listTitle: 'sYnX',
  canEdit: false,
  doneCount: 0,
  totalCount: 0,
  progressPercent: 0,
  isLoggedIn: false,
  lastUpdated: 0,
};

export default createWidget('ListProgressWidget', ListProgressWidget, initialProgressSnapshot);
