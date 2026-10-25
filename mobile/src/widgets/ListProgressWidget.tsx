import { createWidget } from 'expo-widgets';
import {
  Box,
  Row,
  Column,
  Text,
  Button,
  Spacer,
  CircularProgressIndicator,
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
  const progressRatio = Math.min(Math.max((props.progressPercent || 0) / 100, 0), 1);

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
            trackColor={cardBg}
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

      {/* Progress Ring with Centered Percentage */}
      <Box modifiers={[size(68, 68)]} contentAlignment="center">
        <CircularProgressIndicator
          progress={progressRatio}
          color={accent}
          trackColor={cardBg}
          modifiers={[size(68, 68)]}
        />
        <Text style={{ fontSize: 14, fontWeight: 'bold' }} color={textPrimary}>
          {`${props.progressPercent || 0}%`}
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
