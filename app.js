const DB_FILE_PATH = "./data/demo-db.json";
const STORAGE_KEY = "consult-demo-state-v1";
const SESSION_KEY = "consult-demo-session-v1";

const ROLE_LABELS = {
  student: "Студент",
  teacher: "Преподаватель",
  admin: "Администратор"
};

const BOOKING_STATUS_LABELS = {
  active: "Активна",
  canceledByStudent: "Отменена студентом",
  canceledByTeacher: "Отменена преподавателем",
  canceledByAdmin: "Отменена администратором"
};

const SLOT_STATUS_LABELS = {
  open: "Открыта",
  canceled: "Отменена"
};

const tabsByRole = {
  student: [
    { id: "student-slots", label: "Запись на консультацию" },
    { id: "student-bookings", label: "Мои записи" }
  ],
  teacher: [
    { id: "teacher-slots", label: "Мои консультации" },
    { id: "teacher-bookings", label: "Студенты" }
  ],
  admin: [
    { id: "admin-users", label: "Пользователи" },
    { id: "admin-teachers", label: "Преподаватели" },
    { id: "admin-overview", label: "Обзор" }
  ]
};

const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const userBadge = document.getElementById("userBadge");
const tabNav = document.getElementById("tabNav");
const tabContent = document.getElementById("tabContent");
const logoutBtn = document.getElementById("logoutBtn");
const resetDemoBtn = document.getElementById("resetDemoBtn");

let initialDb = null;
let state = null;
let currentUser = null;
let activeTab = null;

init();

async function init() {
  try {
    const response = await fetch(DB_FILE_PATH);
    if (!response.ok) {
      throw new Error("Ошибка загрузки файла базы данных.");
    }

    initialDb = await response.json();
    state = loadStateOrDefault(initialDb);
    restoreSession();
    bindEvents();
    render();
  } catch (error) {
    loginView.innerHTML = `
      <h2>Не удалось загрузить демо-данные</h2>
      <p class="error">${escapeHtml(error.message)}</p>
      <p>Проверьте запуск через локальный сервер.</p>
    `;
  }
}

function bindEvents() {
  loginForm.addEventListener("submit", onLogin);
  logoutBtn.addEventListener("click", onLogout);
  resetDemoBtn.addEventListener("click", onResetDemoData);
  tabNav.addEventListener("click", onTabClick);
  tabContent.addEventListener("click", onContentClick);
  tabContent.addEventListener("submit", onContentSubmit);
}

function onLogin(event) {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const login = String(formData.get("login") || "").trim();
  const password = String(formData.get("password") || "").trim();

  const user = state.users.find(
    (candidate) => candidate.login === login && candidate.password === password
  );

  if (!user) {
    loginError.classList.remove("hidden");
    return;
  }

  loginError.classList.add("hidden");
  currentUser = user;
  activeTab = tabsByRole[currentUser.role][0].id;
  saveSession();
  render();
}

function onLogout() {
  currentUser = null;
  activeTab = null;
  clearSession();
  render();
}

function onResetDemoData() {
  const confirmed = window.confirm(
    "Сбросить все демо-изменения и вернуть исходные данные?"
  );
  if (!confirmed) {
    return;
  }

  state = cloneData(initialDb);
  persistState();
  currentUser = null;
  activeTab = null;
  clearSession();
  render();
}

function onTabClick(event) {
  const button = event.target.closest("[data-tab]");
  if (!button) {
    return;
  }

  activeTab = button.dataset.tab;
  saveSession();
  render();
}

function onContentClick(event) {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) {
    return;
  }

  if (!currentUser) {
    return;
  }

  const action = actionButton.dataset.action;

  if (action === "book-slot" && currentUser.role === "student") {
    bookSlot(actionButton.dataset.slotId);
    return;
  }

  if (action === "cancel-booking" && currentUser.role === "student") {
    cancelBookingByStudent(actionButton.dataset.bookingId);
    return;
  }

  if (action === "delete-user" && currentUser.role === "admin") {
    deleteUser(actionButton.dataset.userId);
    return;
  }

  if (action === "cancel-slot" && currentUser.role === "teacher") {
    cancelSlotByTeacher(actionButton.dataset.slotId);
    return;
  }
}

function onContentSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  if (!currentUser) {
    return;
  }

  if (form.dataset.form === "add-slot" && currentUser.role === "teacher") {
    event.preventDefault();
    addTeacherSlot(form);
    return;
  }

  if (form.dataset.form === "move-slot" && currentUser.role === "teacher") {
    event.preventDefault();
    moveTeacherSlot(form);
    return;
  }

  if (form.dataset.form === "add-user" && currentUser.role === "admin") {
    event.preventDefault();
    addUserByAdmin(form);
    return;
  }

  if (
    form.dataset.form === "update-teacher" &&
    currentUser.role === "admin"
  ) {
    event.preventDefault();
    updateTeacherByAdmin(form);
  }
}

function render() {
  const loggedIn = Boolean(currentUser);

  loginView.classList.toggle("hidden", loggedIn);
  appView.classList.toggle("hidden", !loggedIn);

  if (!loggedIn) {
    userBadge.classList.add("hidden");
    return;
  }

  userBadge.classList.remove("hidden");
  userBadge.textContent = `${ROLE_LABELS[currentUser.role]}: ${currentUser.name}`;
  renderTabNavigation();
  renderTabContent();
}

function renderTabNavigation() {
  const availableTabs = tabsByRole[currentUser.role];
  const tabExists = availableTabs.some((tab) => tab.id === activeTab);
  if (!tabExists) {
    activeTab = availableTabs[0].id;
  }

  tabNav.innerHTML = availableTabs
    .map((tab) => {
      const isActive = tab.id === activeTab;
      return `<button type="button" class="btn tab-btn ${isActive ? "active" : ""}" data-tab="${tab.id}">
        ${escapeHtml(tab.label)}
      </button>`;
    })
    .join("");
}

function renderTabContent() {
  if (currentUser.role === "student") {
    if (activeTab === "student-slots") {
      tabContent.innerHTML = renderStudentSlotsTab();
      return;
    }
    tabContent.innerHTML = renderStudentBookingsTab();
    return;
  }

  if (currentUser.role === "teacher") {
    if (activeTab === "teacher-slots") {
      tabContent.innerHTML = renderTeacherSlotsTab();
      return;
    }
    tabContent.innerHTML = renderTeacherBookingsTab();
    return;
  }

  if (activeTab === "admin-users") {
    tabContent.innerHTML = renderAdminUsersTab();
    return;
  }

  if (activeTab === "admin-teachers") {
    tabContent.innerHTML = renderAdminTeachersTab();
    return;
  }

  tabContent.innerHTML = renderAdminOverviewTab();
}

function renderStudentSlotsTab() {
  const teacherMap = createMap(state.users.filter((user) => user.role === "teacher"));
  const activeBookingsBySlot = new Set(
    state.bookings
      .filter((booking) => booking.status === "active")
      .map((booking) => booking.slotId)
  );

  const availableSlots = state.slots
    .filter((slot) => slot.status === "open" && !activeBookingsBySlot.has(slot.id))
    .sort(compareSlotDateTime);

  const slotsHtml =
    availableSlots.length === 0
      ? `<p class="muted">Свободных консультаций пока нет.</p>`
      : `<ul class="list">
      ${availableSlots
        .map((slot) => {
          const teacher = teacherMap.get(slot.teacherId);
          return `
            <li class="item">
              <div class="item-header">
                <strong>${escapeHtml(formatSlotDateTime(slot))}</strong>
                <span class="status open">${escapeHtml(SLOT_STATUS_LABELS[slot.status])}</span>
              </div>
              <div class="muted">
                Преподаватель: ${escapeHtml(teacher ? teacher.name : "Не найден")} |
                Дисциплина: ${escapeHtml(teacher?.subject || "Не указана")} |
                Длительность: ${slot.durationMin} мин.
              </div>
              <div class="actions">
                <button type="button" class="btn primary" data-action="book-slot" data-slot-id="${slot.id}">
                  Записаться
                </button>
              </div>
            </li>
          `;
        })
        .join("")}
    </ul>`;

  return `
    <section class="card">
      <h3>Доступные консультации</h3>
      ${slotsHtml}
    </section>
  `;
}

function renderStudentBookingsTab() {
  const slotMap = createMap(state.slots);
  const teacherMap = createMap(state.users.filter((user) => user.role === "teacher"));
  const myBookings = state.bookings
    .filter((booking) => booking.studentId === currentUser.id)
    .sort((left, right) => {
      const leftSlot = slotMap.get(left.slotId);
      const rightSlot = slotMap.get(right.slotId);
      if (!leftSlot || !rightSlot) {
        return 0;
      }
      return compareSlotDateTime(leftSlot, rightSlot);
    });

  if (myBookings.length === 0) {
    return `
      <section class="card">
        <h3>Мои записи</h3>
        <p class="muted">Вы еще не записывались на консультации.</p>
      </section>
    `;
  }

  return `
    <section class="card">
      <h3>Мои записи</h3>
      <ul class="list">
        ${myBookings
          .map((booking) => {
            const slot = slotMap.get(booking.slotId);
            const teacher = slot ? teacherMap.get(slot.teacherId) : null;
            const isActive = booking.status === "active";
            return `
              <li class="item">
                <div class="item-header">
                  <strong>${slot ? escapeHtml(formatSlotDateTime(slot)) : "Слот удален"}</strong>
                  <span class="status ${isActive ? "active" : "canceled"}">
                    ${escapeHtml(BOOKING_STATUS_LABELS[booking.status] || booking.status)}
                  </span>
                </div>
                <div class="muted">
                  Преподаватель: ${escapeHtml(teacher?.name || "Не найден")}
                </div>
                <div class="actions">
                  <button
                    type="button"
                    class="btn danger"
                    data-action="cancel-booking"
                    data-booking-id="${booking.id}"
                    ${isActive ? "" : "disabled"}
                  >
                    Отменить запись
                  </button>
                </div>
              </li>
            `;
          })
          .join("")}
      </ul>
    </section>
  `;
}

function renderTeacherSlotsTab() {
  const mySlots = state.slots
    .filter((slot) => slot.teacherId === currentUser.id)
    .sort(compareSlotDateTime);

  const activeBookingBySlot = new Map(
    state.bookings
      .filter((booking) => booking.status === "active")
      .map((booking) => [booking.slotId, booking])
  );

  return `
    <div class="grid-2">
      <section class="card">
        <h3>Добавить консультацию</h3>
        <form class="form" data-form="add-slot">
          <label>
            Дата
            <input type="date" name="date" required />
          </label>
          <label>
            Время
            <input type="time" name="time" required />
          </label>
          <label>
            Длительность (мин)
            <input type="number" name="durationMin" min="15" step="5" value="30" required />
          </label>
          <button class="btn primary" type="submit">Добавить слот</button>
        </form>
      </section>

      <section class="card">
        <h3>Мои консультации</h3>
        ${
          mySlots.length === 0
            ? '<p class="muted">Слоты еще не добавлены.</p>'
            : `<ul class="list">
            ${mySlots
              .map((slot) => {
                const booking = activeBookingBySlot.get(slot.id);
                return `
                  <li class="item">
                    <div class="item-header">
                      <strong>${escapeHtml(formatSlotDateTime(slot))}</strong>
                      <span class="status ${slot.status === "open" ? "open" : "canceled"}">
                        ${escapeHtml(SLOT_STATUS_LABELS[slot.status])}
                      </span>
                    </div>
                    <div class="muted">
                      Длительность: ${slot.durationMin} мин. |
                      Запись: ${booking ? "есть студент" : "свободно"}
                    </div>
                    <form class="form" data-form="move-slot">
                      <input type="hidden" name="slotId" value="${slot.id}" />
                      <label>
                        Новая дата
                        <input type="date" name="date" value="${slot.date}" required />
                      </label>
                      <label>
                        Новое время
                        <input type="time" name="time" value="${slot.time}" required />
                      </label>
                      <div class="actions">
                        <button class="btn warning" type="submit" ${slot.status === "canceled" ? "disabled" : ""}>
                          Перенести
                        </button>
                        <button
                          type="button"
                          class="btn danger"
                          data-action="cancel-slot"
                          data-slot-id="${slot.id}"
                          ${slot.status === "canceled" ? "disabled" : ""}
                        >
                          Отменить
                        </button>
                      </div>
                    </form>
                  </li>
                `;
              })
              .join("")}
          </ul>`
        }
      </section>
    </div>
  `;
}

function renderTeacherBookingsTab() {
  const studentMap = createMap(state.users.filter((user) => user.role === "student"));
  const mySlots = state.slots.filter((slot) => slot.teacherId === currentUser.id);
  const mySlotIds = new Set(mySlots.map((slot) => slot.id));
  const slotMap = createMap(mySlots);

  const bookings = state.bookings
    .filter((booking) => mySlotIds.has(booking.slotId))
    .sort((left, right) => {
      const leftSlot = slotMap.get(left.slotId);
      const rightSlot = slotMap.get(right.slotId);
      if (!leftSlot || !rightSlot) {
        return 0;
      }
      return compareSlotDateTime(leftSlot, rightSlot);
    });

  return `
    <section class="card">
      <h3>Студенты, записавшиеся на консультации</h3>
      ${
        bookings.length === 0
          ? '<p class="muted">Пока нет записей студентов.</p>'
          : `<ul class="list">
          ${bookings
            .map((booking) => {
              const student = studentMap.get(booking.studentId);
              const slot = slotMap.get(booking.slotId);
              const isActive = booking.status === "active";
              return `
                <li class="item">
                  <div class="item-header">
                    <strong>${slot ? escapeHtml(formatSlotDateTime(slot)) : "Слот не найден"}</strong>
                    <span class="status ${isActive ? "active" : "canceled"}">
                      ${escapeHtml(BOOKING_STATUS_LABELS[booking.status] || booking.status)}
                    </span>
                  </div>
                  <div class="muted">
                    Студент: ${escapeHtml(student?.name || "Не найден")}
                    ${student?.group ? `(${escapeHtml(student.group)})` : ""}
                  </div>
                </li>
              `;
            })
            .join("")}
        </ul>`
      }
    </section>
  `;
}

function renderAdminUsersTab() {
  const users = [...state.users].sort((left, right) => {
    if (left.role !== right.role) {
      return left.role.localeCompare(right.role, "ru");
    }
    return left.name.localeCompare(right.name, "ru");
  });

  return `
    <div class="grid-2">
      <section class="card">
        <h3>Добавить пользователя</h3>
        <form class="form" data-form="add-user">
          <label>
            Роль
            <select name="role" required>
              <option value="student">Студент</option>
              <option value="teacher">Преподаватель</option>
              <option value="admin">Администратор</option>
            </select>
          </label>
          <label>
            ФИО
            <input type="text" name="name" required />
          </label>
          <label>
            Логин
            <input type="text" name="login" required />
          </label>
          <label>
            Пароль
            <input type="text" name="password" required />
          </label>
          <label>
            Группа (для студента)
            <input type="text" name="group" />
          </label>
          <label>
            Предмет (для преподавателя)
            <input type="text" name="subject" />
          </label>
          <button class="btn primary" type="submit">Добавить</button>
        </form>
      </section>

      <section class="card">
        <h3>Список пользователей</h3>
        <ul class="list">
          ${users
            .map((user) => {
              const canDelete = currentUser.id !== user.id;
              return `
                <li class="item">
                  <div class="item-header">
                    <strong>${escapeHtml(user.name)}</strong>
                    <span class="status open">${escapeHtml(ROLE_LABELS[user.role])}</span>
                  </div>
                  <div class="muted">
                    Логин: ${escapeHtml(user.login)}
                    ${
                      user.role === "student" && user.group
                        ? `| Группа: ${escapeHtml(user.group)}`
                        : ""
                    }
                    ${
                      user.role === "teacher" && user.subject
                        ? `| Предмет: ${escapeHtml(user.subject)}`
                        : ""
                    }
                  </div>
                  <div class="actions">
                    <button
                      type="button"
                      class="btn danger"
                      data-action="delete-user"
                      data-user-id="${user.id}"
                      ${canDelete ? "" : "disabled"}
                    >
                      Удалить
                    </button>
                  </div>
                </li>
              `;
            })
            .join("")}
        </ul>
      </section>
    </div>
  `;
}

function renderAdminTeachersTab() {
  const teachers = state.users.filter((user) => user.role === "teacher");

  return `
    <section class="card">
      <h3>Редактирование преподавателей</h3>
      ${
        teachers.length === 0
          ? '<p class="muted">Преподаватели не найдены.</p>'
          : `<ul class="list">
            ${teachers
              .map(
                (teacher) => `
              <li class="item">
                <form class="form" data-form="update-teacher">
                  <input type="hidden" name="teacherId" value="${teacher.id}" />
                  <label>
                    ФИО преподавателя
                    <input type="text" name="name" value="${escapeHtmlAttribute(teacher.name)}" required />
                  </label>
                  <label>
                    Дисциплина
                    <input type="text" name="subject" value="${escapeHtmlAttribute(teacher.subject || "")}" required />
                  </label>
                  <button class="btn success" type="submit">Сохранить</button>
                </form>
              </li>
            `
              )
              .join("")}
          </ul>`
      }
    </section>
  `;
}

function renderAdminOverviewTab() {
  const students = state.users.filter((user) => user.role === "student");
  const teachers = state.users.filter((user) => user.role === "teacher");
  const activeBookings = state.bookings.filter(
    (booking) => booking.status === "active"
  );
  const openSlots = state.slots.filter((slot) => slot.status === "open");

  const slotMap = createMap(state.slots);
  const teacherMap = createMap(teachers);
  const studentMap = createMap(students);

  return `
    <section class="card">
      <h3>Общая информация</h3>
      <div class="summary">
        <div class="summary-box">Студенты<strong>${students.length}</strong></div>
        <div class="summary-box">Преподаватели<strong>${teachers.length}</strong></div>
        <div class="summary-box">Открытые слоты<strong>${openSlots.length}</strong></div>
        <div class="summary-box">Активные записи<strong>${activeBookings.length}</strong></div>
      </div>

      <h3>Последние записи</h3>
      ${
        state.bookings.length === 0
          ? '<p class="muted">Записи отсутствуют.</p>'
          : `<table class="table">
          <thead>
            <tr>
              <th>Дата и время</th>
              <th>Студент</th>
              <th>Преподаватель</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            ${[...state.bookings]
              .sort((left, right) => {
                const leftSlot = slotMap.get(left.slotId);
                const rightSlot = slotMap.get(right.slotId);
                if (!leftSlot || !rightSlot) {
                  return 0;
                }
                return compareSlotDateTime(rightSlot, leftSlot);
              })
              .slice(0, 12)
              .map((booking) => {
                const slot = slotMap.get(booking.slotId);
                const student = studentMap.get(booking.studentId);
                const teacher = slot ? teacherMap.get(slot.teacherId) : null;
                const isActive = booking.status === "active";
                return `
                  <tr>
                    <td>${slot ? escapeHtml(formatSlotDateTime(slot)) : "Слот не найден"}</td>
                    <td>${escapeHtml(student?.name || "Не найден")}</td>
                    <td>${escapeHtml(teacher?.name || "Не найден")}</td>
                    <td>
                      <span class="status ${isActive ? "active" : "canceled"}">
                        ${escapeHtml(BOOKING_STATUS_LABELS[booking.status] || booking.status)}
                      </span>
                    </td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>`
      }
    </section>
  `;
}

function bookSlot(slotId) {
  const slot = state.slots.find((candidate) => candidate.id === slotId);
  if (!slot || slot.status !== "open") {
    return;
  }

  const activeBooking = state.bookings.find(
    (booking) => booking.slotId === slotId && booking.status === "active"
  );
  if (activeBooking) {
    return;
  }

  state.bookings.push({
    id: generateId("booking"),
    slotId,
    studentId: currentUser.id,
    status: "active",
    createdAt: new Date().toISOString()
  });
  persistState();
  render();
}

function cancelBookingByStudent(bookingId) {
  const booking = state.bookings.find((candidate) => candidate.id === bookingId);
  if (!booking || booking.studentId !== currentUser.id) {
    return;
  }
  if (booking.status !== "active") {
    return;
  }

  booking.status = "canceledByStudent";
  persistState();
  render();
}

function addTeacherSlot(form) {
  const formData = new FormData(form);
  const date = String(formData.get("date") || "");
  const time = String(formData.get("time") || "");
  const durationMin = Number(formData.get("durationMin") || 30);

  if (!date || !time || !Number.isFinite(durationMin) || durationMin < 15) {
    return;
  }

  state.slots.push({
    id: generateId("slot"),
    teacherId: currentUser.id,
    date,
    time,
    durationMin: Math.round(durationMin),
    status: "open"
  });

  form.reset();
  persistState();
  render();
}

function moveTeacherSlot(form) {
  const formData = new FormData(form);
  const slotId = String(formData.get("slotId") || "");
  const date = String(formData.get("date") || "");
  const time = String(formData.get("time") || "");
  const slot = state.slots.find((candidate) => candidate.id === slotId);
  if (!slot || slot.teacherId !== currentUser.id || slot.status === "canceled") {
    return;
  }

  slot.date = date;
  slot.time = time;
  persistState();
  render();
}

function cancelSlotByTeacher(slotId) {
  const slot = state.slots.find((candidate) => candidate.id === slotId);
  if (!slot || slot.teacherId !== currentUser.id || slot.status === "canceled") {
    return;
  }

  slot.status = "canceled";
  state.bookings.forEach((booking) => {
    if (booking.slotId === slot.id && booking.status === "active") {
      booking.status = "canceledByTeacher";
    }
  });
  persistState();
  render();
}

function addUserByAdmin(form) {
  const formData = new FormData(form);
  const role = String(formData.get("role") || "");
  const name = String(formData.get("name") || "").trim();
  const login = String(formData.get("login") || "").trim();
  const password = String(formData.get("password") || "").trim();
  const group = String(formData.get("group") || "").trim();
  const subject = String(formData.get("subject") || "").trim();

  if (!ROLE_LABELS[role] || !name || !login || !password) {
    return;
  }

  const duplicateLogin = state.users.some((user) => user.login === login);
  if (duplicateLogin) {
    window.alert("Пользователь с таким логином уже существует.");
    return;
  }

  const newUser = {
    id: generateId(role),
    role,
    name,
    login,
    password
  };

  if (role === "student") {
    newUser.group = group || "Без группы";
  }
  if (role === "teacher") {
    newUser.subject = subject || "Без дисциплины";
  }

  state.users.push(newUser);
  form.reset();
  persistState();
  render();
}

function deleteUser(userId) {
  if (currentUser.id === userId) {
    return;
  }

  const user = state.users.find((candidate) => candidate.id === userId);
  if (!user) {
    return;
  }

  const confirmed = window.confirm(
    `Удалить пользователя "${user.name}" и связанные данные?`
  );
  if (!confirmed) {
    return;
  }

  if (user.role === "student") {
    state.bookings.forEach((booking) => {
      if (booking.studentId === user.id && booking.status === "active") {
        booking.status = "canceledByAdmin";
      }
    });
  }

  if (user.role === "teacher") {
    state.slots.forEach((slot) => {
      if (slot.teacherId === user.id && slot.status === "open") {
        slot.status = "canceled";
      }
    });
    state.bookings.forEach((booking) => {
      const slot = state.slots.find((candidate) => candidate.id === booking.slotId);
      if (slot?.teacherId === user.id && booking.status === "active") {
        booking.status = "canceledByAdmin";
      }
    });
  }

  state.users = state.users.filter((candidate) => candidate.id !== userId);
  persistState();
  render();
}

function updateTeacherByAdmin(form) {
  const formData = new FormData(form);
  const teacherId = String(formData.get("teacherId") || "");
  const name = String(formData.get("name") || "").trim();
  const subject = String(formData.get("subject") || "").trim();
  const teacher = state.users.find(
    (candidate) => candidate.id === teacherId && candidate.role === "teacher"
  );

  if (!teacher || !name || !subject) {
    return;
  }

  teacher.name = name;
  teacher.subject = subject;
  persistState();
  render();
}

function restoreSession() {
  const rawSession = localStorage.getItem(SESSION_KEY);
  if (!rawSession) {
    return;
  }

  try {
    const session = JSON.parse(rawSession);
    const user = state.users.find((candidate) => candidate.id === session.userId);
    if (user) {
      currentUser = user;
      activeTab = session.activeTab || tabsByRole[user.role][0].id;
    }
  } catch (error) {
    clearSession();
  }
}

function saveSession() {
  if (!currentUser) {
    return;
  }
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      userId: currentUser.id,
      activeTab
    })
  );
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  saveSession();
}

function loadStateOrDefault(db) {
  const rawState = localStorage.getItem(STORAGE_KEY);
  if (!rawState) {
    return cloneData(db);
  }
  try {
    const parsed = JSON.parse(rawState);
    if (!isStateLike(parsed)) {
      return cloneData(db);
    }
    return parsed;
  } catch (error) {
    return cloneData(db);
  }
}

function isStateLike(value) {
  return (
    value &&
    Array.isArray(value.users) &&
    Array.isArray(value.slots) &&
    Array.isArray(value.bookings)
  );
}

function createMap(list) {
  return new Map(list.map((item) => [item.id, item]));
}

function compareSlotDateTime(left, right) {
  const leftDate = `${left.date}T${left.time}`;
  const rightDate = `${right.date}T${right.time}`;
  if (leftDate < rightDate) {
    return -1;
  }
  if (leftDate > rightDate) {
    return 1;
  }
  return 0;
}

function formatSlotDateTime(slot) {
  const date = new Date(`${slot.date}T${slot.time}:00`);
  const dateText = date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
  return `${dateText} ${slot.time}`;
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function cloneData(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value);
}
