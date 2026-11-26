import { createWidget } from 'expo-widgets';
import {
  Box,
  Row,
  Column,
  Text,
  Button,
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
  // title would push the count, the switch button and the add button off the
  // edge. Give the title a width that leaves room for them, and use a compact
  // "+" button when the widget is narrow.
  const widgetWidth = environment?.width ?? 300;
  const isNarrowHeader = widgetWidth < 240;
  const countLabel = `${props.doneCount}/${props.totalCount}`;
  const countWidth = countLabel.length * 7 + 12;
  const addButtonWidth = props.canEdit ? (isNarrowHeader ? 36 : 64) : 0;
  // Switch button (plus its gap) that opens the app to choose another list.
  const switchButtonWidth = 32;
  const titleWidth = Math.max(
    48,
    widgetWidth - 24 - countWidth - (switchButtonWidth + 6) - addButtonWidth - 12
  );

  // Task rows: the text column gets a fixed width so long task names truncate
  // instead of squeezing the reminder label into a tall, wrapped column.
  // Widget padding (24) + row padding (12) + checkbox (40) + priority dot (6) + gaps.
  const taskTextWidth = Math.max(
    60,
    widgetWidth - 24 - 12 - (props.canEdit ? 40 : 0) - 6 - 8
  );
  const undoButtonWidth = 52;
  const pendingTextWidth = Math.max(48, taskTextWidth - undoButtonWidth - 6);
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

        {/* Android widget rows don't support spaceBetween, so the count, switch and add
            buttons sit in a row that fills the rest of the header, aligned to the end. */}
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

          {/* Switch list: opens the app's Lists tab to pick which list this widget
              shows. Tapping the list name still opens the list itself. */}
          <Box modifiers={[width(6)]} />
          <Button
            target="open:synx://pick-pinned-list"
            colors={{ containerColor: cardBg, contentColor: textPrimary }}
            modifiers={[padding(0, 4, 0, 4), width(switchButtonWidth), cornerRadius(8)]}
          >
            <Text style={{ fontSize: 13, fontWeight: 'bold' }} color={textPrimary} maxLines={1}>
              ⇄
            </Text>
          </Button>

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
            const isPendingComplete = Boolean(task.pendingCompletedAt != null || task.completed);

            if (props.canEdit && isPendingComplete) {
              const handleUndo = () => {
                'worklet';
                const now = Date.now();
                const existingTasks = props.tasks || [];
                const currentTask = existingTasks.find((t) => t.id === task.id);
                if (
                  !currentTask ||
                  (currentTask.pendingCompletedAt == null && !currentTask.completed)
                ) {
                  return undefined;
                }
                const opId = `w_${task.id}_${now}_${Math.floor(Math.random() * 1e9).toString(36)}`;
                const isRecurring = Boolean(
                  currentTask.recurrence && currentTask.recurrence !== 'none'
                );
                const nextTasks = existingTasks.map((t) => {
                  if (t.id !== task.id) return t;
                  const restored: WidgetTaskItem = {
                    id: t.id,
                    text: t.text,
                    completed: false,
                    priority: t.priority,
                    recurrence: t.recurrence,
                  };
                  if (t.reminderAt != null) restored.reminderAt = t.reminderAt;
                  if (t.reminderLabel != null) restored.reminderLabel = t.reminderLabel;
                  if (t.isOverdue != null) restored.isOverdue = t.isOverdue;
                  if (t.isRunning != null) restored.isRunning = t.isRunning;
                  if (t.subtaskProgress != null) restored.subtaskProgress = t.subtaskProgress;
                  return restored;
                });
                const nextDone = isRecurring
                  ? props.doneCount || 0
                  : Math.max(0, (props.doneCount || 0) - 1);
                const pendingOps = [
                  ...(props.pendingOps || []),
                  {
                    todoId: task.id,
                    listId: props.listId,
                    completed: false,
                    at: now,
                    opId,
                  },
                ];
                return {
                  ...props,
                  tasks: nextTasks,
                  doneCount: nextDone,
                  pendingOps,
                  lastTapAt: 0,
                };
              };

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
                  <Button
                    target={`undo:${task.id}`}
                    colors={{ containerColor: 'transparent', contentColor: '#FFFFFF' }}
                    modifiers={[size(40, 32)]}
                    onClick={handleUndo}
                  >
                    <Box modifiers={[size(40, 32)]} contentAlignment="center">
                      <Box
                        modifiers={[size(18, 18), background(accent), cornerRadius(4)]}
                        contentAlignment="center"
                      >
                        <Text style={{ fontSize: 12, fontWeight: 'bold' }} color="#FFFFFF">
                          ✓
                        </Text>
                      </Box>
                    </Box>
                  </Button>
                  {priorityDotColor !== 'transparent' ? (
                    <Box
                      modifiers={[
                        size(6, 6),
                        background(textMuted),
                        cornerRadius(3),
                      ]}
                    />
                  ) : null}
                  <Column modifiers={[width(pendingTextWidth), padding(6, 0, 4, 0)]}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '500',
                        textDecoration: 'lineThrough',
                      }}
                      color={textMuted}
                      maxLines={1}
                    >
                      {task.text}
                    </Text>
                    {task.isRunning || task.subtaskProgress || task.reminderLabel ? (
                      <Text style={{ fontSize: 10 }} color={textMuted} maxLines={1}>
                        Done
                      </Text>
                    ) : null}
                  </Column>
                  <Row
                    modifiers={[fillMaxWidth()]}
                    verticalAlignment="center"
                    horizontalArrangement="end"
                  >
                    <Button
                      target={`undo:${task.id}`}
                      colors={{ containerColor: accentLight, contentColor: accent }}
                      modifiers={[width(undoButtonWidth), padding(4, 5, 4, 5), cornerRadius(6)]}
                      onClick={handleUndo}
                    >
                      <Box modifiers={[fillMaxWidth()]} contentAlignment="center">
                        <Text style={{ fontSize: 11, fontWeight: 'bold' }} color={accent} maxLines={1}>
                          Undo
                        </Text>
                      </Box>
                    </Button>
                  </Row>
                </Row>
              );
            }

            if (props.canEdit) {
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
                  {/* Only tapping the checkbox marks a task done; the rest of the row opens the task.
                      Drawn as a Box instead of a native CheckBox so our onClick worklet runs reliably. */}
                  <Button
                    target={`complete:${task.id}`}
                    colors={{ containerColor: 'transparent', contentColor: textPrimary }}
                    modifiers={[size(40, 32)]}
                    onClick={() => {
                      'worklet';
                      const now = Date.now();
                      const existingTasks = props.tasks || [];
                      const currentTask = existingTasks.find((t) => t.id === task.id);
                      if (
                        !currentTask ||
                        currentTask.pendingCompletedAt != null ||
                        currentTask.completed
                      ) {
                        return undefined;
                      }
                      if (
                        typeof props.lastTapAt === 'number' &&
                        now >= props.lastTapAt &&
                        now - props.lastTapAt < 800
                      ) {
                        return undefined;
                      }
                      const opId = `w_${task.id}_${now}_${Math.floor(Math.random() * 1e9).toString(36)}`;
                      const isRecurring = Boolean(
                        currentTask.recurrence && currentTask.recurrence !== 'none'
                      );
                      const nextTasks = existingTasks.map((t) =>
                        t.id === task.id
                          ? { ...t, completed: true, pendingCompletedAt: now }
                          : t
                      );
                      const nextDone = isRecurring
                        ? props.doneCount || 0
                        : props.totalCount > 0
                        ? Math.min((props.doneCount || 0) + 1, props.totalCount)
                        : (props.doneCount || 0) + 1;
                      const pendingOps = [
                        ...(props.pendingOps || []),
                        {
                          todoId: task.id,
                          listId: props.listId,
                          completed: true,
                          at: now,
                          opId,
                        },
                      ];
                      return {
                        ...props,
                        tasks: nextTasks,
                        doneCount: nextDone,
                        pendingOps,
                        lastTapAt: now,
                      };
                    }}
                  >
                    <Box modifiers={[size(40, 32)]} contentAlignment="center">
                      <Box
                        modifiers={[size(18, 18), background(textMuted), cornerRadius(4), paddingAll(2)]}
                      >
                        <Box modifiers={[fillMaxSize(), background(cardBg), cornerRadius(3)]} />
                      </Box>
                    </Box>
                  </Button>
                  <Button
                    target={`open:synx://list/${props.listId}?task=${task.id}`}
                    colors={{ containerColor: 'transparent', contentColor: textPrimary }}
                    modifiers={[fillMaxWidth()]}
                  >
                    <Row modifiers={[fillMaxWidth()]} verticalAlignment="center">
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
                        {task.isRunning || task.subtaskProgress || task.reminderLabel ? (
                          <Row verticalAlignment="center">
                            {task.isRunning ? (
                              <Text style={{ fontSize: 10, fontWeight: 'bold' }} color={accent} maxLines={1}>
                                {task.subtaskProgress || task.reminderLabel ? '⏱ · ' : '⏱'}
                              </Text>
                            ) : null}
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
                </Row>
              );
            }

            return (
              <Button
                key={task.id}
                target={`open:synx://list/${props.listId}?task=${task.id}`}
                colors={{ containerColor: 'transparent', contentColor: textPrimary }}
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
                    {task.isRunning || task.subtaskProgress || task.reminderLabel ? (
                      <Row verticalAlignment="center">
                        {task.isRunning ? (
                          <Text style={{ fontSize: 10, fontWeight: 'bold' }} color={accent} maxLines={1}>
                            {task.subtaskProgress || task.reminderLabel ? '⏱ · ' : '⏱'}
                          </Text>
                        ) : null}
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
