// Get DOM elements
const todoInput = document.getElementById('todoInput');
const addBtn = document.getElementById('addBtn');
const todoList = document.getElementById('todoList');
const taskCount = document.getElementById('taskCount');

// Load todos from localStorage
let todos = JSON.parse(localStorage.getItem('todos')) || [];

// Render todos
function renderTodos() {
    todoList.innerHTML = '';
    todos.forEach((todo, index) => {
        const todoItem = document.createElement('div');
        todoItem.className = `todo-item ${todo.completed ? 'completed' : ''}`;
        
        todoItem.innerHTML = `
            <input 
                type="checkbox" 
                class="todo-checkbox" 
                ${todo.completed ? 'checked' : ''}
                onchange="toggleTodo(${index})"
            >
            <span class="todo-text">${todo.text}</span>
            <button class="delete-button" onclick="deleteTodo(${index})">Delete</button>
        `;
        
        todoList.appendChild(todoItem);
    });
    
    updateTaskCount();
}

// Add new todo
function addTodo() {
    const text = todoInput.value.trim();
    if (text === '') {
        todoInput.focus();
        return;
    }
    
    todos.push({ text, completed: false });
    saveTodos();
    todoInput.value = '';
    todoInput.focus();
    renderTodos();
}

// Toggle todo completion
function toggleTodo(index) {
    todos[index].completed = !todos[index].completed;
    saveTodos();
    renderTodos();
}

// Delete todo
function deleteTodo(index) {
    todos.splice(index, 1);
    saveTodos();
    renderTodos();
}

// Update task count
function updateTaskCount() {
    const total = todos.length;
    const completed = todos.filter(todo => todo.completed).length;
    const remaining = total - completed;
    
    if (total === 0) {
        taskCount.textContent = 'No tasks';
    } else if (remaining === 0) {
        taskCount.textContent = `All ${total} tasks completed! 🎉`;
    } else {
        taskCount.textContent = `${remaining} of ${total} tasks remaining`;
    }
}

// Save todos to localStorage
function saveTodos() {
    localStorage.setItem('todos', JSON.stringify(todos));
}

// Event listeners
addBtn.addEventListener('click', addTodo);
todoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addTodo();
    }
});

// Make functions globally available for inline event handlers
window.toggleTodo = toggleTodo;
window.deleteTodo = deleteTodo;

// Initial render
renderTodos();
