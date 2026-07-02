/* ==========================================================
   To-Do リスト アプリ本体（script.js）
   --------------------------------------------------------
   このファイル1つで「タスクの管理」「画面への表示」
   「ローカルストレージへの保存」をすべて行っています。
   上から順番に読んでいけば処理の流れがわかるように
   なるべく分かりやすい構成にしています。
   ========================================================== */

/* ----------------------------------------------------------
   1. データを保存する場所（localStorage）の設定
   ---------------------------------------------------------- */

// localStorageに保存するときの「鍵（キー）」の名前
// この名前でブラウザにデータを保存・読み込みする
const STORAGE_KEY = "todo-list-tasks";

/**
 * 古い形式のタスクを新しい形式に変換する関数
 * 例: カテゴリー機能を追加する前に保存されたタスクには category が無いので、
 *     「その他」を補って壊れたデータにならないようにする
 */
function migrateTask(task) {
  return {
    id: task.id,
    title: task.title,
    deadline: task.deadline || "",
    deadlineTime: task.deadlineTime || "", // 新しく追加した項目。無ければ「時刻指定なし」扱い
    priority: task.priority || "medium",
    category: task.category || "other", // 新しく追加した項目。無ければ「その他」扱い
    todayFlag: !!task.todayFlag, // 「今日やること」に追加されているか。無ければ未追加扱い
    done: !!task.done,
  };
}

/**
 * タスクの配列をlocalStorageから読み込む関数
 * まだ何も保存されていない場合は、空の配列を返す
 */
function loadTasks() {
  const json = localStorage.getItem(STORAGE_KEY);
  if (!json) {
    return []; // 保存データがなければ空リストからスタート
  }
  try {
    const rawTasks = JSON.parse(json);
    return rawTasks.map(migrateTask); // 読み込むたびに必ず新しい形式に揃える
  } catch (error) {
    // 万が一データが壊れていた場合も、アプリが止まらないようにする
    console.error("タスクデータの読み込みに失敗しました", error);
    return [];
  }
}

/**
 * タスクの配列をlocalStorageに保存する関数
 */
function saveTasks(tasks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

// アプリ起動時に、保存されているタスクを読み込んでおく
// （これがこのアプリの「現在のタスク一覧」の実体になる）
let tasks = loadTasks();

// 現在編集中のタスクのID。編集していないときは null
let editingId = null;

// 現在選択されているステータスフィルター（"all" | "todo" | "done"）
let currentFilter = "all";

/* ----------------------------------------------------------
   2. 画面の部品（HTML要素）を取得しておく
   ---------------------------------------------------------- */

const taskForm = document.getElementById("task-form");
const taskInput = document.getElementById("task-input");
const deadlineInput = document.getElementById("deadline-input");
const deadlineTimeInput = document.getElementById("deadline-time-input");
const priorityInput = document.getElementById("priority-input");
const categoryInput = document.getElementById("category-input");
const submitBtn = document.getElementById("submit-btn");
const cancelEditBtn = document.getElementById("cancel-edit-btn");

const taskListEl = document.getElementById("task-list");
const emptyMessageEl = document.getElementById("empty-message");

const searchInput = document.getElementById("search-input");
const filterButtonsEl = document.getElementById("filter-buttons");

const statTotalEl = document.getElementById("stat-total");
const statTodoEl = document.getElementById("stat-todo");
const statDoneEl = document.getElementById("stat-done");
const statPercentEl = document.getElementById("stat-percent");
const progressBarFillEl = document.getElementById("progress-bar-fill");

const todayTaskListEl = document.getElementById("today-task-list");
const todayEmptyMessageEl = document.getElementById("today-empty-message");

const categoryBreakdownListEl = document.getElementById("category-breakdown-list");
const categoryBreakdownEmptyEl = document.getElementById("category-breakdown-empty");

const themeToggleBtn = document.getElementById("theme-toggle-btn");

const screenTabsEl = document.getElementById("screen-tabs");
const swipeViewportEl = document.getElementById("swipe-viewport");
const swipeTrackEl = document.getElementById("swipe-track");
const todayScreenTaskListEl = document.getElementById("today-screen-task-list");
const todayScreenEmptyMessageEl = document.getElementById("today-screen-empty-message");

/* ----------------------------------------------------------
   3. 優先度・カテゴリーの並び順や表示ラベルの設定
   ---------------------------------------------------------- */

// 優先度を「高→中→低」の順に並べたいので、数字の小ささで比較する
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

// 優先度の表示ラベル（日本語）
const PRIORITY_LABELS = { high: "高", medium: "中", low: "低" };

// カテゴリーの表示ラベル（日本語）。オブジェクトのキー順がそのまま表示順になる
const CATEGORY_LABELS = {
  job: "就活",
  study: "勉強",
  university: "大学",
  parttime: "アルバイト",
  private: "プライベート",
  other: "その他",
};

/* ----------------------------------------------------------
   4. タスクの追加・編集処理（フォームの送信）
   ---------------------------------------------------------- */

// フォームが送信されたとき（「追加」または「更新」ボタンが押されたとき）の処理
taskForm.addEventListener("submit", (event) => {
  // フォーム送信時のページ再読み込みを止める（SPAなので必須）
  event.preventDefault();

  const title = taskInput.value.trim(); // 前後の余計な空白を削除
  if (title === "") {
    return; // 空のタスクは追加しない
  }

  const deadline = deadlineInput.value; // 未入力なら空文字 ""
  // 期限の日付が未入力なら、時刻だけ入っていても意味がないので空にする
  const deadlineTime = deadline ? deadlineTimeInput.value : "";
  const priority = priorityInput.value; // "high" | "medium" | "low"
  const category = categoryInput.value; // "study" | "job" | "parttime" | "private" | "other"

  if (editingId === null) {
    // --- 新規追加モード ---
    const newTask = {
      id: Date.now().toString(), // 現在時刻を文字列にして、簡易的なユニークIDにする
      title,
      deadline,
      deadlineTime,
      priority,
      category,
      done: false,
    };
    tasks.push(newTask);
  } else {
    // --- 編集モード：該当タスクの内容だけを書き換える ---
    const target = tasks.find((t) => t.id === editingId);
    if (target) {
      target.title = title;
      target.deadline = deadline;
      target.deadlineTime = deadlineTime;
      target.priority = priority;
      target.category = category;
    }
    stopEditing(); // 編集モードを終了してフォームを通常表示に戻す
  }

  saveTasks(tasks);
  renderTasks();

  // フォームをリセットして、次のタスクを入力しやすくする
  taskForm.reset();
  priorityInput.value = "medium"; // 優先度は「中」に戻しておく
  categoryInput.value = "other"; // カテゴリーは「その他」に戻しておく
  taskInput.focus();
});

/**
 * 指定したタスクの内容をフォームに読み込み、編集モードに入る
 */
function startEditing(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  editingId = id;
  taskInput.value = task.title;
  deadlineInput.value = task.deadline;
  deadlineTimeInput.value = task.deadlineTime;
  priorityInput.value = task.priority;
  categoryInput.value = task.category;

  submitBtn.textContent = "更新";
  cancelEditBtn.hidden = false;

  // フォームが画面外にあってもすぐ見えるようにスクロールする
  taskForm.scrollIntoView({ behavior: "smooth", block: "start" });
  taskInput.focus();
}

/**
 * 編集モードを終了し、フォームを新規追加用の見た目に戻す
 */
function stopEditing() {
  editingId = null;
  submitBtn.textContent = "追加";
  cancelEditBtn.hidden = true;
}

// 「キャンセル」ボタンが押されたら、入力内容を破棄して編集モードを終了する
cancelEditBtn.addEventListener("click", () => {
  stopEditing();
  taskForm.reset();
  priorityInput.value = "medium";
  categoryInput.value = "other";
});

/* ----------------------------------------------------------
   5. タスクの完了切り替え・削除処理
   ---------------------------------------------------------- */

/**
 * 指定したIDのタスクの「完了/未完了」を切り替える
 */
function toggleTaskDone(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.done = !task.done;
  saveTasks(tasks);
  renderTasks();
}

/**
 * 指定したIDのタスクの「今日やることに追加されているか」を切り替える
 */
function toggleTodayFlag(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.todayFlag = !task.todayFlag;
  saveTasks(tasks);
  renderTasks();
}

/**
 * 指定したIDのタスクを削除する
 */
function deleteTask(id) {
  // 削除前に確認ダイアログを出して、誤操作を防ぐ
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  const confirmed = confirm(`「${task.title}」を削除しますか？`);
  if (!confirmed) return;

  // 編集中のタスクを削除した場合は、編集モードも解除しておく
  if (editingId === id) {
    stopEditing();
    taskForm.reset();
  }

  tasks = tasks.filter((t) => t.id !== id);
  saveTasks(tasks);
  renderTasks();
}

/* ----------------------------------------------------------
   6. 期限に関する表示ヘルパー
   ---------------------------------------------------------- */

/**
 * 今日の日付を "YYYY-MM-DD" の形式で取得する
 * date input の値と文字列で比較するために使う
 */
function getTodayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 期限の日付から、あと何日かを計算する（マイナスなら期限切れ）
 */
function getDaysUntil(deadline) {
  const today = new Date(getTodayString());
  const target = new Date(deadline);
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * 期限が過ぎている（＝期限切れ）かどうかを判定する
 * 時刻まで指定されている場合は、日付が今日のときだけ時刻もチェックする
 * （明日以降の期限は日付だけで判断すれば十分なため）
 */
function isOverdue(task) {
  if (!task.deadline) return false;

  const days = getDaysUntil(task.deadline);
  if (days < 0) return true;
  if (days > 0) return false;

  // ここに来るのは「期限の日付が今日」のケース
  if (!task.deadlineTime) return false; // 時刻指定が無ければ、今日中はまだ期限内とみなす

  const [hour, minute] = task.deadlineTime.split(":").map(Number);
  const deadlineMoment = new Date();
  deadlineMoment.setHours(hour, minute, 0, 0);
  return new Date() > deadlineMoment;
}

/**
 * 期限の緊急度に応じたCSSクラス名を返す
 * （期限切れ＝赤、3日以内＝オレンジ、それ以外＝青）
 */
function getDeadlineUrgencyClass(task) {
  if (isOverdue(task)) return "deadline-overdue";
  const days = getDaysUntil(task.deadline);
  if (days <= 3) return "deadline-soon";
  return "deadline-normal";
}

/**
 * 期限を画面表示用の短い文字列に変換する
 * 例: "2026-07-05" 18:00 → "07/05 18:00（あと3日）"
 * 時刻が指定されていなければ従来通り日付のみを表示する
 * 期限切れの場合は、はっきり分かるように「期限切れ」と表示する
 */
function formatDeadlineLabel(task) {
  const days = getDaysUntil(task.deadline);
  const [, month, day] = task.deadline.split("-");
  const dateLabel = task.deadlineTime
    ? `${month}/${day} ${task.deadlineTime}`
    : `${month}/${day}`;

  if (isOverdue(task)) {
    return `${dateLabel}（期限切れ）`;
  }
  if (days === 0) {
    return `${dateLabel}（今日まで）`;
  }
  return `${dateLabel}（あと${days}日）`;
}

/* ----------------------------------------------------------
   7. タスクの絞り込み・並び替え
   ---------------------------------------------------------- */

/**
 * ステータスフィルター（すべて／未完了／完了済み）と検索文字列で
 * タスクを絞り込む
 */
function getFilteredTasks(taskArray) {
  const keyword = searchInput.value.trim().toLowerCase();

  return taskArray.filter((task) => {
    // ステータスでの絞り込み
    if (currentFilter === "todo" && task.done) return false;
    if (currentFilter === "done" && !task.done) return false;

    // タスク名での絞り込み（部分一致・大文字小文字を区別しない）
    if (keyword !== "" && !task.title.toLowerCase().includes(keyword)) {
      return false;
    }

    return true;
  });
}

/**
 * タスクを「期限が近い順」に並び替える
 * ルール:
 *   1. 未完了のタスクを、完了済みタスクより先に表示する
 *   2. 期限が設定されているタスクを、期限なしタスクより先に表示する
 *   3. 期限が近い順に並べる
 *   4. 期限が同じ場合は、優先度が高い順に並べる
 */
function getSortedTasks(taskArray) {
  // 元の配列を壊さないように、コピーしてから並び替える
  return [...taskArray].sort((a, b) => {
    // (1) 完了状態で比較
    if (a.done !== b.done) {
      return a.done ? 1 : -1;
    }

    // (2) 期限の有無で比較（期限なしは後ろへ）
    const aHasDeadline = a.deadline !== "";
    const bHasDeadline = b.deadline !== "";
    if (aHasDeadline !== bHasDeadline) {
      return aHasDeadline ? -1 : 1;
    }

    // (3) 期限の日付で比較（両方とも期限ありの場合のみ）
    if (aHasDeadline && bHasDeadline && a.deadline !== b.deadline) {
      return a.deadline < b.deadline ? -1 : 1;
    }

    // (3.5) 日付が同じ場合は時刻で比較する（時刻未指定は「23:59」扱いで最後に回す）
    if (aHasDeadline && bHasDeadline) {
      const aTime = a.deadlineTime || "23:59";
      const bTime = b.deadlineTime || "23:59";
      if (aTime !== bTime) {
        return aTime < bTime ? -1 : 1;
      }
    }

    // (4) 優先度で比較
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });
}

/* ----------------------------------------------------------
   8. 画面への描画
   ---------------------------------------------------------- */

/**
 * 1件のタスクから、画面に表示する <li> 要素を作る
 * （タスク一覧・今日のタスク欄のどちらからも呼び出される共通部品）
 */
function createTaskElement(task) {
  const li = document.createElement("li");
  li.className = `task-item priority-${task.priority}`;
  if (task.done) {
    li.classList.add("done");
  }
  if (!task.done && isOverdue(task)) {
    li.classList.add("overdue"); // 期限切れタスクをカード全体で赤く強調する
  }

  // --- 完了チェックボックス ---
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "task-checkbox";
  checkbox.checked = task.done;
  checkbox.addEventListener("change", () => toggleTaskDone(task.id));

  // --- タスク名 + タグ類をまとめるブロック ---
  const main = document.createElement("div");
  main.className = "task-main";

  const title = document.createElement("div");
  title.className = "task-title";
  title.textContent = task.title;

  const meta = document.createElement("div");
  meta.className = "task-meta";

  // カテゴリーのタグ
  const categoryTag = document.createElement("span");
  categoryTag.className = `task-tag category-tag-${task.category}`;
  categoryTag.textContent = CATEGORY_LABELS[task.category];
  meta.appendChild(categoryTag);

  // 期限のタグ（期限が設定されている場合のみ表示）
  if (task.deadline) {
    const deadlineTag = document.createElement("span");
    const urgencyClass = getDeadlineUrgencyClass(task);
    deadlineTag.className = `task-tag deadline-tag ${urgencyClass}`;
    deadlineTag.textContent = formatDeadlineLabel(task);
    meta.appendChild(deadlineTag);
  }

  // 優先度のタグ
  const priorityTag = document.createElement("span");
  priorityTag.className = `task-tag priority-tag-${task.priority}`;
  priorityTag.textContent = `優先度: ${PRIORITY_LABELS[task.priority]}`;
  meta.appendChild(priorityTag);

  main.appendChild(title);
  main.appendChild(meta);

  // --- 「今日やることへ追加」トグルボタン ---
  const todayToggleBtn = document.createElement("button");
  todayToggleBtn.type = "button";
  todayToggleBtn.className = "today-toggle-btn";
  if (task.todayFlag) {
    todayToggleBtn.classList.add("active");
    todayToggleBtn.textContent = "★";
    todayToggleBtn.setAttribute("aria-label", "今日やることから削除");
  } else {
    todayToggleBtn.textContent = "☆";
    todayToggleBtn.setAttribute("aria-label", "今日やることへ追加");
  }
  todayToggleBtn.addEventListener("click", () => toggleTodayFlag(task.id));

  // --- 編集ボタン ---
  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "edit-btn";
  editBtn.textContent = "✎";
  editBtn.setAttribute("aria-label", "タスクを編集");
  editBtn.addEventListener("click", () => startEditing(task.id));

  // --- 削除ボタン ---
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "delete-btn";
  deleteBtn.textContent = "✕";
  deleteBtn.setAttribute("aria-label", "タスクを削除");
  deleteBtn.addEventListener("click", () => deleteTask(task.id));

  li.appendChild(checkbox);
  li.appendChild(main);
  li.appendChild(todayToggleBtn);
  li.appendChild(editBtn);
  li.appendChild(deleteBtn);

  return li;
}

/**
 * タスクの配列を、指定した<ul>要素の中に描画する
 * （タスク一覧・今日のタスク欄で共通して使う）
 */
function renderTaskListInto(containerEl, taskArray) {
  containerEl.innerHTML = ""; // 一度空にしてから、作り直す（シンプルな実装）
  taskArray.forEach((task) => {
    containerEl.appendChild(createTaskElement(task));
  });
}

/**
 * 統計タイル（総タスク数・未完了・完了・進捗率）を更新する
 */
function renderProgress() {
  const total = tasks.length;
  const doneCount = tasks.filter((task) => task.done).length;
  const todoCount = total - doneCount;
  const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  statTotalEl.textContent = total;
  statTodoEl.textContent = todoCount;
  statDoneEl.textContent = doneCount;
  statPercentEl.textContent = `${percent}%`;
  progressBarFillEl.style.width = `${percent}%`;
}

/**
 * 横棒リストを描画する共通部品
 * items: [{ label: "表示名", count: 件数, percent: 割合(0〜100), colorVar: "CSS変数名" }, ...]
 * カテゴリー別集計など、「項目ごとの件数を棒グラフ風に見せたい」場面で使い回す
 */
function renderBarListInto(containerEl, items) {
  containerEl.innerHTML = "";

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "bar-row";

    const labelRow = document.createElement("div");
    labelRow.className = "bar-label-row";

    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = item.label;

    const count = document.createElement("span");
    count.className = "bar-count";
    count.textContent = `${item.count}件 (${item.percent}%)`;

    labelRow.appendChild(label);
    labelRow.appendChild(count);

    const track = document.createElement("div");
    track.className = "bar-track";

    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${item.percent}%`;
    fill.style.backgroundColor = `var(${item.colorVar})`;

    track.appendChild(fill);
    row.appendChild(labelRow);
    row.appendChild(track);
    containerEl.appendChild(row);
  });
}

/**
 * カテゴリー別集計カードを更新する
 * （件数が多いカテゴリーから順に表示する。0件のカテゴリーは表示しない）
 */
function renderCategoryBreakdown() {
  const total = tasks.length;

  const items = Object.keys(CATEGORY_LABELS)
    .map((categoryKey) => {
      const count = tasks.filter((task) => task.category === categoryKey).length;
      const percent = total === 0 ? 0 : Math.round((count / total) * 100);
      return {
        label: CATEGORY_LABELS[categoryKey],
        count,
        percent,
        colorVar: `--category-${categoryKey}`,
      };
    })
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);

  renderBarListInto(categoryBreakdownListEl, items);
  categoryBreakdownEmptyEl.hidden = items.length > 0;
}

/**
 * 今日のタスク欄を更新する
 */
function renderTodayTasks() {
  const today = getTodayString();
  const todaysTasks = getSortedTasks(tasks.filter((task) => task.deadline === today));

  renderTaskListInto(todayTaskListEl, todaysTasks);
  todayEmptyMessageEl.hidden = todaysTasks.length > 0;
}

/**
 * 「今日やること」画面（画面2）を更新する
 * ☆ボタンで手動で追加したタスクだけを、期限が近い順に表示する
 */
function renderTodayScreenTasks() {
  const todayFlaggedTasks = getSortedTasks(tasks.filter((task) => task.todayFlag));

  renderTaskListInto(todayScreenTaskListEl, todayFlaggedTasks);
  todayScreenEmptyMessageEl.hidden = todayFlaggedTasks.length > 0;
}

/**
 * タスク一覧を画面に描画する（データが変わるたびに呼び出す）
 */
function renderTasks() {
  const filteredTasks = getFilteredTasks(tasks);
  const sortedTasks = getSortedTasks(filteredTasks);

  renderTaskListInto(taskListEl, sortedTasks);

  // タスクが1件も表示されないときは案内メッセージを表示する
  emptyMessageEl.hidden = sortedTasks.length > 0;

  renderProgress();
  renderTodayTasks();
  renderCategoryBreakdown();
  renderTodayScreenTasks();
}

/* ----------------------------------------------------------
   9. ダークモードの切り替え
   ---------------------------------------------------------- */

// ダークモードの設定を保存するときの鍵の名前
const THEME_KEY = "todo-list-theme";

/**
 * テーマ（ライト／ダーク）を実際に画面へ適用し、localStorageに保存する
 * ダークモードかどうかは <html> 要素の data-theme 属性で管理している
 * （index.html側にも、ページ読み込み直後に同じ属性を復元する処理がある）
 */
function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.dataset.theme = "dark";
    themeToggleBtn.textContent = "☀️";
  } else {
    delete document.documentElement.dataset.theme;
    themeToggleBtn.textContent = "🌙";
  }
  localStorage.setItem(THEME_KEY, theme);
}

// ボタンが押されるたびに、今と逆のテーマに切り替える
themeToggleBtn.addEventListener("click", () => {
  const isDark = document.documentElement.dataset.theme === "dark";
  applyTheme(isDark ? "light" : "dark");
});

// ページを開いたときのボタンの見た目を、現在のテーマに合わせておく
// （テーマ自体はindex.html内のインラインスクリプトで既に適用済み）
applyTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");

/* ----------------------------------------------------------
   10. 画面の左右スワイプ切り替え（画面1: リスト / 画面2: 今日やること）
   ---------------------------------------------------------- */

// 画面の枚数（リスト・今日やること の2枚）
const SCREEN_COUNT = 2;

// 現在表示中の画面番号（0 または 1）
let currentScreen = 0;

/**
 * 指定した画面番号へ切り替える
 * トラックを transform で動かし、タブの見た目（active・aria-selected）も同期させる
 */
function goToScreen(screenIndex) {
  currentScreen = screenIndex;

  // トラック全体の幅は画面2枚分(200%)なので、1画面分動かすには50%ずつずらせばよい
  swipeTrackEl.style.transform = `translateX(-${screenIndex * 50}%)`;

  screenTabsEl.querySelectorAll(".screen-tab").forEach((tab) => {
    const isActive = Number(tab.dataset.screen) === screenIndex;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

// タブをクリックしたときの画面切り替え（スワイプできないPC・マウス環境向け）
screenTabsEl.addEventListener("click", (event) => {
  const tab = event.target.closest(".screen-tab");
  if (!tab) return;
  goToScreen(Number(tab.dataset.screen));
});

// --- ここからスマホでの指スワイプ操作 ---

// タッチ開始位置と、現在の移動量・ジェスチャーの向きを覚えておく変数
let touchStartX = 0;
let touchStartY = 0;
let touchDeltaX = 0;
let swipeDirection = null; // "horizontal" | "vertical" | null(まだ判定前)
let viewportWidth = 0;

swipeViewportEl.addEventListener(
  "touchstart",
  (event) => {
    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchDeltaX = 0;
    swipeDirection = null;
    viewportWidth = swipeViewportEl.clientWidth;
    swipeTrackEl.classList.add("dragging"); // ドラッグ中はアニメーションを切って指に追従させる
  },
  { passive: true }
);

swipeViewportEl.addEventListener(
  "touchmove",
  (event) => {
    const touch = event.touches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;

    // 最初にある程度動いた時点で、縦スクロールか横スワイプかを一度だけ判定する
    if (swipeDirection === null && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
      swipeDirection = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
    }

    if (swipeDirection === "horizontal") {
      // 横スワイプ中はページの縦スクロールが起きないようにする
      event.preventDefault();
      touchDeltaX = deltaX;

      const basePercent = -currentScreen * 50;
      const dragPercent = (touchDeltaX / viewportWidth) * 50;
      swipeTrackEl.style.transform = `translateX(${basePercent + dragPercent}%)`;
    }
    // 縦スワイプと判定した場合は何もしない（ブラウザ標準の縦スクロールに任せる）
  },
  { passive: false }
);

swipeViewportEl.addEventListener("touchend", () => {
  swipeTrackEl.classList.remove("dragging");

  if (swipeDirection === "horizontal") {
    const threshold = viewportWidth * 0.2; // 画面幅の20%以上動かしたら切り替える
    if (touchDeltaX <= -threshold && currentScreen < SCREEN_COUNT - 1) {
      goToScreen(currentScreen + 1);
    } else if (touchDeltaX >= threshold && currentScreen > 0) {
      goToScreen(currentScreen - 1);
    } else {
      goToScreen(currentScreen); // しきい値未満なら元の画面へスナックバックする
    }
  }

  swipeDirection = null;
});

/* ----------------------------------------------------------
   11. イベント登録・初期表示
   ---------------------------------------------------------- */

// 検索欄に文字が入力されるたびに、絞り込みをやり直す
searchInput.addEventListener("input", renderTasks);

// フィルターボタン（すべて／未完了／完了済み）のクリック処理
filterButtonsEl.addEventListener("click", (event) => {
  const button = event.target.closest(".filter-btn");
  if (!button) return;

  currentFilter = button.dataset.filter;

  // 選択中のボタンだけに active クラスを付ける
  filterButtonsEl.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.toggle("active", btn === button);
  });

  renderTasks();
});

// ページを開いたときに、保存されているタスクを画面に表示する
renderTasks();
