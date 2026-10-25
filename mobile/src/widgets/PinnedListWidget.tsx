import { createWidget } from 'expo-widgets';
import {
  Box,
  Row,
  Column,
  Text,
  Button,
  Checkbox,
  LazyColumn,
} from '@expo/ui/jetpack-compose';
import {
  padding,
  paddingAll,
  fillMaxSize,
  fillMaxWidth,
  size,
  width,
  background,
  cornerRadius,
} from '@expo/ui/jetpack-compose/modifiers';
import type { ListWidgetSnapshot, WidgetTaskItem } from '../shared/widget-snapshot';

export function PinnedListWidget(
  props: ListWidgetSnapshot,
  environment: { colorScheme?: 'light' | 'dark'; width?: number; height?: number }
) {
  'widget';
  const isDark = environment?.colorScheme !== 'light';

  // Header sizing. Android widget rows can't share leftover space, so a long
  // title would push the count and the add button off the edge. Give the
  // title a width that leaves room for both, and use a compact "+" button
  // when the widget is narrow.
  const widgetWidth = environment?.width ?? 300;
  const isNarrowHeader = widgetWidth < 240;
  const countLabel = `${props.doneCount}/${props.totalCount}`;
  const countWidth = countLabel.length * 7 + 12;
  const addButtonWidth = props.canEdit ? (isNarrowHeader ? 36 : 64) : 0;
  const titleWidth = Math.max(48, widgetWidth - 24 - countWidth - addButtonWidth - 12);

  // Task rows: the text column gets a fixed width so long task names truncate
  // instead of squeezing the reminder label into a tall, wrapped column.
  // Widget padding (24) + row padding (12) + checkbox (40) + priority dot (6) + gaps.
  const taskTextWidth = Math.max(
    60,
    widgetWidth - 24 - 12 - (props.canEdit ? 40 : 0) - 6 - 8
  );
  const bg = isDark ? '#18181B' : '#FFFFFF';
  const cardBg = isDark ? '#27272A' : '#F4F4F5';
  const textPrimary = isDark ? '#F4F4F5' : '#18181B';
  const textMuted = isDark ? '#A1A1AA' : '#71717A';
  const accent = '#6366F1';
  const accentLight = isDark ? '#312E81' : '#EEF2FF';

  // Logged-out or uninitialized state
  if (!props?.isLoggedIn || !props?.listId) {
    return (
      <Column
        modifiers={[fillMaxSize(), paddingAll(16), background(bg), cornerRadius(16)]}
        horizontalAlignment="center"
        verticalArrangement="center"
      >
        <Text
          style={{ fontSize: 20, fontWeight: '800' }}
          color={textPrimary}
        >
          sYnX
        </Text>
        <Text
          style={{ fontSize: 13, fontWeight: '500' }}
          color={textMuted}
          modifiers={[padding(0, 4, 0, 12)]}
        >
          Pin a list in sYnX to view here
        </Text>
        <Button
          target="open:synx://"
          colors={{ containerColor: accent, contentColor: '#FFFFFF' }}
          modifiers={[padding(16, 8, 16, 8), cornerRadius(12)]}
        >
          <Text style={{ fontSize: 13, fontWeight: 'bold' }} color="#FFFFFF">
            Open sYnX
          </Text>
        </Button>
      </Column>
    );
  }

  const tasks = props.tasks || [];
  // Scrollable list, so show everything in the snapshot (the builder caps it at 20).
  const displayTasks = tasks;

  return (
    <Column
      modifiers={[fillMaxSize(), paddingAll(12), background(bg), cornerRadius(16)]}
    >
      {/* Header bar */}
      <Row modifiers={[fillMaxWidth(), padding(0, 0, 0, 8)]} verticalAlignment="center">
        <Button
          target={`open:synx://list/${props.listId}`}
          colors={{ containerColor: 'transparent', contentColor: textPrimary }}
          modifiers={[width(titleWidth)]}
        >
          <Row verticalAlignment="center">
            <Text
              style={{ fontSize: 15, fontWeight: 'bold' }}
              color={textPrimary}
              maxLines={1}
            >
              {`${props.categoryEmoji || '📌'} ${props.listTitle || 'Pinned List'}`}
            </Text>
            {props.ownershipLabel && props.ownershipLabel !== 'Yours' ? (
              <Box
                modifiers={[
                  padding(6, 2, 6, 2),
                  background(accentLight),
                  cornerRadius(6),
                ]}
              >
                <Text style={{ fontSize: 10, fontWeight: '600' }} color={accent}>
                  {props.ownershipLabel}
                </Text>
              </Box>
            ) : null}
          </Row>
        </Button>

        {/* Android widget rows don't support spaceBetween, so the count and add
            button sit in a row that fills the rest of the header, aligned to the end. */}
        <Row modifiers={[fillMaxWidth()]} verticalAlignment="center" horizontalArrangement="end">
          <Box
            modifiers={[
              padding(6, 2, 6, 2),
              background(cardBg),
              cornerRadius(6),
            ]}
          >
            <Text style={{ fontSize: 11, fontWeight: '600' }} color={textMuted}>
              {countLabel}
            </Text>
          </Box>

          {props.canEdit ? <Box modifiers={[width(6)]} /> : null}
          {props.canEdit ? (
            <Button
              target={`open:synx://list/${props.listId}?action=newTask`}
              colors={{ containerColor: accent, contentColor: '#FFFFFF' }}
              modifiers={[
                padding(isNarrowHeader ? 0 : 8, 4, isNarrowHeader ? 0 : 8, 4),
                width(addButtonWidth),
                cornerRadius(8),
              ]}
            >
              <Text style={{ fontSize: 12, fontWeight: 'bold' }} color="#FFFFFF" maxLines={1}>
                {isNarrowHeader ? '+' : '+ Add'}
              </Text>
            </Button>
          ) : null}
        </Row>
      </Row>

      {/* Task list or empty state */}
      {displayTasks.length === 0 ? (
        <Column
          modifiers={[fillMaxSize()]}
          horizontalAlignment="center"
          verticalArrangement="center"
        >
          <Text style={{ fontSize: 14, fontWeight: '500' }} color={textMuted}>
            {props.categoryEmoji === '⏰' ? 'No upcoming reminders ⏰' : 'All caught up! 🎉'}
          </Text>
          {props.canEdit ? (
            <Button
              target={`open:synx://list/${props.listId}?action=newTask`}
              colors={{ containerColor: cardBg, contentColor: accent }}
              modifiers={[padding(12, 6, 12, 6), cornerRadius(8)]}
            >
              <Text style={{ fontSize: 12, fontWeight: '600' }} color={accent}>
                + Add task
              </Text>
            </Button>
          ) : null}
        </Column>
      ) : (
        <LazyColumn modifiers={[fillMaxWidth(), fillMaxSize()]} verticalArrangement={{ spacedBy: 4 }}>
          {displayTasks.map((task: WidgetTaskItem) => {
            const priorityDotColor =
              task.priority === 'high'
                ? '#EF4444'
                : task.priority === 'medium'
                ? '#F59E0B'
                : task.priority === 'low'
                ? '#3B82F6'
                : 'transparent';

            if (props.canEdit) {
              return (
                <Button
                  key={task.id}
                  target={`complete:${task.id}`}
                  colors={{ containerColor: 'transparent', contentColor: textPrimary }}
                  onClick={() => {
                    'worklet';
                    const nextTasks = (props.tasks || []).filter((t) => t.id !== task.id);
                    const pendingOps = [
                      ...(props.pendingOps || []),
                      {
                        todoId: task.id,
                        listId: props.listId,
                        completed: true,
                        at: Date.now(),
                      },
                    ];
                    return {
                      ...props,
                      tasks: nextTasks,
                      doneCount: (props.doneCount || 0) + 1,
                      pendingOps,
                    };
                  }}
                >
                  <Row
                    modifiers={[
                      fillMaxWidth(),
                      padding(6, 4, 6, 4),
                      background(cardBg),
                      cornerRadius(8),
                    ]}
                    verticalAlignment="center"
                  >
                    <Checkbox
                      value={false}
                      colors={{ checkedColor: accent, uncheckedColor: textMuted }}
                    />
                    {priorityDotColor !== 'transparent' ? (
                      <Box
                        modifiers={[
                          size(6, 6),
                          background(priorityDotColor),
                          cornerRadius(3),
                        ]}
                      />
                    ) : null}
                    <Column modifiers={[width(taskTextWidth), padding(6, 0, 6, 0)]}>
                      <Text
                        style={{ fontSize: 13, fontWeight: '500' }}
                        color={textPrimary}
                        maxLines={1}
                      >
                        {task.text}
                      </Text>
                      {task.subtaskProgress || task.reminderLabel ? (
                        <Row verticalAlignment="center">
                          {task.subtaskProgress ? (
                            <Text style={{ fontSize: 10 }} color={textMuted} maxLines={1}>
                              {task.reminderLabel ? `${task.subtaskProgress} · ` : task.subtaskProgress}
                            </Text>
                          ) : null}
                          {task.reminderLabel ? (
                            <Text
                              style={{
                                fontSize: 10,
                                fontWeight: task.isOverdue ? 'bold' : 'normal',
                              }}
                              color={task.isOverdue ? '#EF4444' : textMuted}
                              maxLines={1}
                            >
                              {task.reminderLabel}
                            </Text>
                          ) : null}
                        </Row>
                      ) : null}
                    </Column>
                  </Row>
                </Button>
              );
            }

            return (
              <Row
                key={task.id}
                modifiers={[
                  fillMaxWidth(),
                  padding(6, 4, 6, 4),
                  background(cardBg),
                  cornerRadius(8),
                ]}
                verticalAlignment="center"
              >
                {priorityDotColor !== 'transparent' ? (
                  <Box
                    modifiers={[
                      size(6, 6),
                      background(priorityDotColor),
                      cornerRadius(3),
                    ]}
                  />
                ) : null}
                <Column modifiers={[width(taskTextWidth), padding(6, 0, 6, 0)]}>
                  <Text
                    style={{ fontSize: 13, fontWeight: '500' }}
                    color={textPrimary}
                    maxLines={1}
                  >
                    {task.text}
                  </Text>
                  {task.subtaskProgress || task.reminderLabel ? (
                    <Row verticalAlignment="center">
                      {task.subtaskProgress ? (
                        <Text style={{ fontSize: 10 }} color={textMuted} maxLines={1}>
                          {task.reminderLabel ? `${task.subtaskProgress} · ` : task.subtaskProgress}
                        </Text>
                      ) : null}
                      {task.reminderLabel ? (
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: task.isOverdue ? 'bold' : 'normal',
                          }}
                          color={task.isOverdue ? '#EF4444' : textMuted}
                          maxLines={1}
                        >
                          {task.reminderLabel}
                        </Text>
                      ) : null}
                    </Row>
                  ) : null}
                </Column>
              </Row>
            );
          })}
        </LazyColumn>
      )}
    </Column>
  );
}

export const initialSnapshot: ListWidgetSnapshot = {
  listId: '',
  listTitle: 'sYnX',
  categoryEmoji: '📌',
  canEdit: false,
  isOwner: true,
  ownershipLabel: '',
  tasks: [],
  doneCount: 0,
  totalCount: 0,
  pendingOps: [],
  isLoggedIn: false,
  lastUpdated: 0,
};

export default createWidget('PinnedListWidget', PinnedListWidget, initialSnapshot);
