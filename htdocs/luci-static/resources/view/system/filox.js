'use strict';
'require view';
'require fs';
'require ui';
'require dom';
'require rpc';
'require view.system.filox.md as md';
'require view.system.filox.md_help as md_help';
'require view.system.filox.HexEditor as HE';

const callFileList = rpc.declare({
	object: 'file',
	method: 'list',
	params: [ 'path' ]
});

const fileTypes = {
	'block' : _('Block device'),
	'char' : _('Character device'),
	'directory' : _('Directory'),
	'fifo' : _('FIFO/Pipe'),
	'file' : _('File'),
	'socket' : _('Socket'),
	'symlink' : _('Symlink'),
}

function pop(a, message, severity) {
	ui.addNotification(a, message, severity)
}

function popTimeout(a, message, timeout, severity) {
	ui.addTimeLimitedNotification(a, message, timeout, severity)
}

// Initialize global variables
let currentPath = '/'; // Current path in the filesystem
const selectedItems = new Set(); // Set of selected files/directories
let sortField = 'name'; // Field to sort files by
let sortAscending = true; // Sort direction (ascending/descending)
let configFilePath = '/etc/config/filox'; // Path to the configuration file

// Initialize drag counter
let dragCounter = 0;

// Configuration object to store interface settings
let config = {
	// Padding and window sizes
	padding: 10,
	paddingMin: 5,
	paddingMax: 20,
	currentDirectory: '/', // Current directory
	texteditorHeight: 550,
	hexeditorHeight: 550,

	// otherSettings: {} // Additional settings
};

// Function to upload a file to the server
function uploadFile(filename, filedata, onProgress) {
	return new Promise(function(resolve, reject) {
		let formData = new FormData();
		formData.append('sessionid', rpc.getSessionID()); // Add session ID
		formData.append('filename', filename); // File name including path
		formData.append('filedata', filedata); // File data

		let xhr = new XMLHttpRequest();
		xhr.open('POST', L.env.cgi_base + '/cgi-upload', true); // Configure the request

		// Monitor upload progress
		xhr.upload.onprogress = function(event) {
			if (event.lengthComputable && onProgress) {
				let percent = (event.loaded / event.total) * 100;
				onProgress(percent); // Call the progress callback with percentage
			}
		};

		// Handle request completion
		xhr.onload = () => {
			if (xhr.status === 200) {
				resolve(xhr.responseText); // Upload successful
			} else {
				reject(new Error(xhr.statusText)); // Upload error
			}
		};

		// Handle network errors
		xhr.onerror = () => {
			reject(new Error('Network error'));
		};

		xhr.send(formData); // Send the request
	});
}


// Function to load settings from the configuration file

function parseKeyValuePairs(input, delimiter, callback) {
	const pairs = input.split(',');
	pairs.forEach((pair) => {
		const [key, value] = pair.split(delimiter);
		if (key && value) callback(key.trim(), value.trim());
	});
}

async function loadConfig() {
	try {
		const content = await fs.read(configFilePath);
		const lines = content.trim().split('\n');

		lines.forEach((line) => {
			if (!line.includes('option')) return;

			const splitLines = line.split('option').filter(Boolean);

			splitLines.forEach((subline) => {
				const formattedLine = "option " + subline.trim();
				const match = formattedLine.match(/^option\s+(\S+)\s+'([^']+)'$/);

				if (!match) return;

				const [, key, value] = match;

				switch (key) {
					default:
						config[key] = isNaN(value) ? value : parseInt(value, 10);
				}
			});
		});
	} catch (err) {
		console.error('Failed to load config: ' + err.message);
	}
}

// Function to save settings to the configuration file
function saveConfig() {

	let configLines = ['config filox',
		'	option padding \'' + config.padding + '\'',
		'\toption paddingMin \'' + config.paddingMin + '\'',
		'\toption paddingMax \'' + config.paddingMax + '\'',
		'\toption currentDirectory \'' + config.currentDirectory + '\'',
		'\toption texteditorHeight \'' + config.texteditorHeight + '\'',
		'\toption hexeditorHeight \'' + config.hexeditorHeight + '\'',
	];

	const configContent = configLines.join('\n') + '\n';

	// Write settings to file
	return fs.write(configFilePath, configContent).then(() => {
		return Promise.resolve();
	}).catch((err) => {
		return Promise.reject(new Error('Failed to save configuration: ' + err.message));
	});
}

// Function to correctly join paths
function joinPath(path, name) {
	return path.endsWith('/') ? path + name : path + '/' + name;
}

function modeToRwx(mode) {
	const perms = mode & 0o777; // extract permission bits

	const toRwx = n => 
		((n & 4) ? 'r' : '-') +
		((n & 2) ? 'w' : '-') +
		((n & 1) ? 'x' : '-');

	const owner = toRwx((perms >> 6) & 0b111);
	const group = toRwx((perms >> 3) & 0b111);
	const world = toRwx(perms & 0b111);

	return `${owner}${group}${world}`;
}


function modeToOctal(mode) {
	const perms = mode & 0o777;
	return perms.toString(8);
}

// Function to get a list of files in a directory
function getFileList(path) {
	return callFileList(path).then((res) => {
		const files = [];
		res?.entries?.forEach((file) => {
			files.push({
				...file,
				permissions: modeToRwx(file.mode),
				numericPermissions: modeToOctal(file.mode),
			});
		});

		return files;
	});
}

// Function to insert CSS styles into the document
function insertCss(cssContent) {
	const styleElement = document.createElement('style');
	styleElement.type = 'text/css';
	styleElement.appendChild(document.createTextNode(cssContent));
	document.head.appendChild(styleElement);
}

// CSS styles for the file manager interface
const cssContent = `
/* === Filox — Modern Grid Layout === */

/* Grid container */
.file-grid {
	display: flex;
	flex-direction: column;
	width: 100%;
	min-width: 700px;
}

/* Shared grid definition for header + rows */
.file-grid-header,
.file-grid-row {
	display: grid;
	grid-template-columns: 36px minmax(140px, 3fr) 90px 70px 80px 150px minmax(160px, 2fr);
	align-items: center;
	padding: 0;
	min-height: 36px;
}

/* Header row */
.file-grid-header {
	font-weight: 600;
	font-size: 13px;
	color: #555;
	border-bottom: 2px solid #ddd;
	background: #fafafa;
	position: sticky;
	top: 0;
	z-index: 5;
}

/* Data rows */
.file-grid-row {
	border-bottom: 1px solid #eee;
	font-size: 13px;
	transition: background-color .15s;
}
.file-grid-row:nth-child(even) {
	background: #fafbfc;
}

/* Cell base */
.file-cell {
	padding: 6px 10px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

/* Alignment helpers */
.cell-center { text-align: center; }
.cell-right  { text-align: right; }

/* Sort toggle inside header cells */
.sort-button {
	background: none;
	border: none;
	color: inherit;
	cursor: pointer;
	padding: 0 4px;
	font-size: 11px;
	opacity: .4;
	vertical-align: middle;
}
.sort-button:hover { opacity: 1; }

/* Size column monospace alignment */
.size-cell { font-family: monospace; font-size: 12px; }
.size-number { display: inline-block; width: 7ch; text-align: right; }
.size-unit   { display: inline-block; width: 3ch; text-align: left; margin-left: .3ch; }

/* Action buttons inside each row */
.action-button-group {
	display: flex;
	gap: 4px;
	justify-content: flex-end;
	flex-wrap: nowrap;
}
.action-button-group .cbi-button {
	padding: 2px 8px;
	font-size: 12px;
	white-space: nowrap;
}

/* Custom Orange Button */
.custom-rename-btn {
	color: #ff9800 !important;
	border-color: #ff9800 !important;
}
.custom-rename-btn:hover {
	background-color: rgba(255, 152, 0, 0.1) !important;
}

/* Directory / file name links */
.directory-link { font-weight: 600; }
.file-link      { color: inherit; }
.symlink-link   { color: #2a7; }

/* === Page-level layout === */
#filox-container {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

/* Path bar */
.filox-header {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}
.filox-header h2 { margin: 0; white-space: nowrap; }
.filox-header input { flex: 1; min-width: 200px; }

/* Scrollable wrapper around the grid */
#file-list-wrapper {
	width: 100%;
	overflow-x: auto;
	-webkit-overflow-scrolling: touch;
	border: 1px solid #ddd;
	border-radius: 4px;
	position: relative;
}

/* Drag overlay */
#drag-overlay {
	position: absolute; inset: 0;
	background: rgba(0,0,0,.45);
	display: flex; align-items: center; justify-content: center;
	font-size: 22px; color: #fff;
	z-index: 10; pointer-events: none;
}
#file-list-wrapper.drag-over {
	border: 2px dashed #4a90d9;
}

/* Bottom action bar */
.cbi-page-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	padding: 8px 0;
}

/* Status bar */
#status-bar {
	padding: 8px 12px;
	background: #fafafa;
	border: 1px solid #ddd;
	border-radius: 4px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
	font-size: 13px;
}

/* Progress bar */
.cbi-progressbar {
	width: 100%; height: 8px;
	background: #e0e0e0;
	border-radius: 4px;
	overflow: hidden;
}
.cbi-progressbar div {
	height: 100%;
	background: #4a90d9;
	width: 0%;
	transition: width .25s ease;
}

/* === Editor === */
.editor-container {
	display: flex;
	flex-direction: column;
	overflow: hidden;
	border: 1px solid #ddd;
	border-radius: 4px;
}
.editor-content {
	flex: 1;
	display: flex;
	overflow: hidden;
}
.line-numbers {
	width: 48px;
	background: #f5f5f5;
	text-align: right;
	padding-right: 6px;
	user-select: none;
	border-right: 1px solid #ddd;
	overflow: hidden;
	flex-shrink: 0;
}
.line-numbers div {
	font-family: monospace;
	font-size: 13px;
	line-height: 1.3em;
	height: 1.3em;
}
#editor-textarea {
	flex: 1;
	resize: none;
	border: none;
	font-family: monospace;
	font-size: 13px;
	line-height: 1.3em;
	padding: 4px 8px;
	margin: 0;
	overflow: auto;
	box-sizing: border-box;
	background: transparent;
	color: inherit;
}

`;

// Main exported view module
return view.extend({
	editorMode: 'text',
	hexEditorInstance: null,
	// Method called when the view is loaded
	load() {
		const self = this;
		return loadConfig().then(() => {
			currentPath = config.currentDirectory || '/';
			return getFileList(currentPath); // Load the file list for the current directory
		});
	},

	// Method to render the interface
	render(data) {
		const self = this;
		insertCss(cssContent); // Insert CSS styles
		const viewContainer = E('div', {
			'id': 'filox-container'
		}, [
			// Filox Header
			E('div', {
				'class': 'filox-header'
			}, [
				E('h2', {}, _('Filox: ')),
				E('input', {
					'type': 'text',
					'id': 'path-input', 'class': 'cbi-input-text',
					'value': currentPath,
					'style': 'margin-left: 10px;',
					'keydown'(event) {
						if (event.key === 'Enter') {
							self.handleGoButtonClick(); // Trigger directory navigation on Enter
						}
					}
				}),
				E('button', {
					'id': 'go-button', 'class': 'cbi-button cbi-button-apply',
					'click': this.handleGoButtonClick.bind(this),
					'style': 'margin-left: 10px; padding: 3px 12px;'
				}, _('&#8594;'))
			]),

			// Tab Panels
			E('div', {
				'class': 'cbi-tabcontainer',
				'id': 'tab-group'
			}, [
				E('ul', {
					'class': 'cbi-tabmenu'
				}, [
					E('li', {
						'class': 'cbi-tab cbi-tab-active',
						'id': 'tab-filox'
					}, [
						E('a', {
							'href': '#',
							'click': this.switchToTab.bind(this, 'filox')
						}, _('Filox'))
					]),
					E('li', {
						'class': 'cbi-tab',
						'id': 'tab-editor'
					}, [
						E('a', {
							'href': '#',
							'click': this.switchToTab.bind(this, 'editor')
						}, _('Editor'))
					]),


				])
			]),

			// Tab Contents
			E('div', {
				'class': 'cbi-tabcontainer-content'
			}, [
				// Filox Content
				E('div', {
					'id': 'content-filox',
					'class': 'cbi-tab',
					'style': 'display:block;'
				}, [
					// File List Container with Drag-and-Drop
					(() => {
						// Create the container for the file list and drag-and-drop functionality
						const fileListContainer = E('div', {
							'id': 'file-list-wrapper',
						}, [
							E('div', { 'class': 'file-grid', 'id': 'file-table' }, [
								E('div', { 'class': 'file-grid-header' }, [
									E('div', { 'class': 'file-cell cell-center' }, [
										E('input', {
											'type': 'checkbox',
											'id': 'select-all-checkbox',
											'change': this.handleSelectAllChange.bind(this),
											'click': this.handleSelectAllClick.bind(this)
										})
									]),
									E('div', {'data-field': 'name', 'class': 'file-cell'}, [
										_('Name'),
										E('button', { 'class': 'sort-button', 'data-field': 'name' }, '↕')
									]),
									E('div', {'data-field': 'permissions', 'class': 'file-cell'}, [
										_('Permissions'),
										E('button', { 'class': 'sort-button', 'data-field': 'permissions' }, '↕')
									]),
									E('div', {'data-field': 'type', 'class': 'file-cell'}, [
										_('Type'),
										E('button', { 'class': 'sort-button', 'data-field': 'type' }, '↕')
									]),
									E('div', {'data-field': 'size', 'class': 'file-cell cell-right'}, [
										_('Size'),
										E('button', { 'class': 'sort-button', 'data-field': 'size' }, '↕')
									]),
									E('div', {'data-field': 'mtime', 'class': 'file-cell cell-right'}, [
										_('Last Modified'),
										E('button', { 'class': 'sort-button', 'data-field': 'mtime' }, '↕')
									]),
									E('div', {'data-field': 'actions', 'class': 'file-cell cell-right'}, [
										_('Actions')
									])
								]),
								E('div', { 'id': 'file-list', 'style': 'display: contents;' })
							]),
							E('div', {
								'id': 'drag-overlay',
								'style': 'display:none;'
							}, _('Drop files here to upload'))
						]);

						// Attach drag-and-drop event listeners
						fileListContainer.addEventListener('dragenter', this.handleDragEnter.bind(this));
						fileListContainer.addEventListener('dragover', this.handleDragOver.bind(this));
						fileListContainer.addEventListener('dragleave', this.handleDragLeave.bind(this));
						fileListContainer.addEventListener('drop', this.handleDrop.bind(this));

						return fileListContainer;
					}).call(this), // Ensure 'this' context is preserved

					// Status Bar
					E('div', {
						'id': 'status-bar'
					}, [
						E('div', {
							'id': 'status-info'
						}, _('No file selected.')),
						E('div', {
							'id': 'status-progress'
						})
					]),

					// Page Actions
					E('div', {
						'class': 'cbi-page-actions'
					}, [
						E('button', {
							'class': 'cbi-button cbi-button-action',
							'click': this.handleUploadClick.bind(this)
						}, _('Upload File')),
						E('button', {
							'class': 'cbi-button cbi-button-action',
							'click': this.handleMakeDirectoryClick.bind(this)
						}, _('Create Folder')),
						E('button', {
							'class': 'cbi-button cbi-button-action',
							'click': this.handleCreateFileClick.bind(this)
						}, _('Create File')),
						E('button', {
							'id': 'delete-selected-button',
							'class': 'cbi-button cbi-button-action',
							'style': 'display: none;',
							'click': this.handleDeleteSelected.bind(this)
						}, _('Delete Selected'))
					])
				]),

				// Editor Content
				E('div', {
					'id': 'content-editor',
					'class': 'cbi-tab',
					'style': 'display:none;'
				}, [
					E('p', {
						'id': 'editor-message'
					}, _('Select a file from the list to edit it here.')),
					E('div', {
						'id': 'editor-container'
					})
				]),
				// Help Content
				E('div', {
					'id': 'content-help',
					'class': 'cbi-tab',
					'style': 'display:none; padding: 10px; overflow:auto; width: 100%; height: 600px; resize: both; border: 1px solid; border-color: light-dark(var(--light-border),var(--dark-border)); box-sizing: border-box;'
				}, [
					// The content will be dynamically inserted by renderHelp()
				])
			])
		]);
		// Add event listeners
		const sortButtons = viewContainer.querySelectorAll('.sort-button[data-field]');
		sortButtons.forEach((button) => {
			button.addEventListener('click', (event) => {
				event.preventDefault();
				const field = button.getAttribute('data-field');
				if (field) {
					self.sortBy(field); // Sort the file list by the selected field
				}
			});
		});
		// Load the file list and initialize resizeable columns
		this.loadFileList(currentPath).then(() => {
			
			const fileListContainer = document.getElementById('file-list-wrapper');
			if (fileListContainer && typeof ResizeObserver !== 'undefined') {
				// Initialize ResizeObserver only once
				if (!self.fileListResizeObserver) {
					self.fileListResizeObserver = new ResizeObserver((entries) => {
						for (let entry of entries) {
							const newWidth = entry.contentRect.width;
							const newHeight = entry.contentRect.height;
						}
					});
					self.fileListResizeObserver.observe(fileListContainer);
				}
			}
		});
		return viewContainer;
	},

	// Handler for the "Select All" checkbox click
	handleSelectAllClick(ev) {
		if (ev.altKey) {
			ev.preventDefault(); // Prevent the default checkbox behavior
			this.handleInvertSelection();
		} else {
			// Proceed with normal click handling; the 'change' event will be triggered
		}
	},

	// Function to invert selection
	handleInvertSelection() {
		const allCheckboxes = document.querySelectorAll('.select-checkbox');
		allCheckboxes.forEach((checkbox) => {
			checkbox.checked = !checkbox.checked;
			const filePath = checkbox.getAttribute('data-file-path');
			if (checkbox.checked) {
				selectedItems.add(filePath);
			} else {
				selectedItems.delete(filePath);
			}
		});
		// Update the "Select All" checkbox state
		this.updateSelectAllCheckbox();
		// Update the "Delete Selected" button visibility
		this.updateDeleteSelectedButton();
	},

	/**
	 * Switches the active tab in the interface and performs necessary actions based on the selected tab.
	 *
	 * @param {string} tab - The identifier of the tab to switch to ('filox', 'editor', 'settings', or 'help').
	 */
	switchToTab(tab) {
		// Retrieve the content containers for each tab
		const filoxContent = document.getElementById('content-filox');
		const editorContent = document.getElementById('content-editor');

		// Retrieve the tab elements
		const tabFilox = document.getElementById('tab-filox');
		const tabEditor = document.getElementById('tab-editor');

		// Ensure all necessary elements are present
		if (filoxContent && editorContent && tabFilox && tabEditor) {
			// Display the selected tab's content and hide the others
			filoxContent.style.display = (tab === 'filox') ? 'block' : 'none';
			editorContent.style.display = (tab === 'editor') ? 'block' : 'none';

			// Update the active tab's styling
			tabFilox.className = (tab === 'filox') ? 'cbi-tab cbi-tab-active' : 'cbi-tab';
			tabEditor.className = (tab === 'editor') ? 'cbi-tab cbi-tab-active' : 'cbi-tab';

			// Perform actions based on the selected tab
			if (tab === 'filox') {
				// Reload and display the updated file list when the Filox tab is activated
				this.loadFileList(currentPath)
					.catch((err) => {
						// Display an error notification if loading the file list fails
						pop(null, E('p', _('Failed to update file list: %s').format(err.message)), 'error');
					});
			}
			// No additional actions are required for the Editor tab in this context
		}
	},

	// Handler for the "Go" button click to navigate to a directory
	handleGoButtonClick() {
		// Logic to navigate to the specified directory and update the file list
		const self = this;
		const pathInput = document.getElementById('path-input');
		if (pathInput) {
			const newPath = pathInput.value.trim() || '/';
			fs.stat(newPath).then((stat) => {
				if (stat.type === 'directory') {
					currentPath = newPath;
					pathInput.value = currentPath;
					self.loadFileList(currentPath).then(() => {
						
					});
				} else {
					pop(null, E('p', _('The specified path does not appear to be a directory.')), 'error');
				}
			}).catch((err) => {
				pop(null, E('p', _('Failed to access the specified path: %s').format(err.message)), 'error');
			});
		}
	},

	// Handler for dragging files over the drop zone
	handleDragEnter(event) {
		event.preventDefault();
		event.stopPropagation();
		dragCounter++;
		const fileListContainer = document.getElementById('file-list-wrapper');
		const dragOverlay = document.getElementById('drag-overlay');
		if (fileListContainer && dragOverlay) {
			fileListContainer.classList.add('drag-over');
			dragOverlay.style.display = 'flex';
		}
	},

	// Handler for when files are over the drop zone
	handleDragOver(event) {
		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = 'copy'; // Indicate copy action
	},

	// Handler for leaving the drop zone
	handleDragLeave(event) {
		event.preventDefault();
		event.stopPropagation();
		dragCounter--;
		if (dragCounter === 0) {
			const fileListContainer = document.getElementById('file-list-wrapper');
			const dragOverlay = document.getElementById('drag-overlay');
			if (fileListContainer && dragOverlay) {
				fileListContainer.classList.remove('drag-over');
				dragOverlay.style.display = 'none';
			}
		}
	},

	// Handler for dropping files into the drop zone
	handleDrop(event) {
		event.preventDefault();
		event.stopPropagation();
		dragCounter = 0; // Reset counter
		const self = this;
		const files = event.dataTransfer.files;
		const fileListContainer = document.getElementById('file-list-wrapper');
		const dragOverlay = document.getElementById('drag-overlay');
		if (fileListContainer && dragOverlay) {
			fileListContainer.classList.remove('drag-over');
			dragOverlay.style.display = 'none';
		}
		if (files.length > 0) {
			self.uploadFiles(files);
		}
	},

	// Handler for uploading a file
	handleUploadClick(ev) {
		const self = this;
		const fileInput = document.createElement('input');
		fileInput.type = 'file';
		fileInput.multiple = true; // Allow selecting multiple files
		fileInput.style.display = 'none';
		document.body.appendChild(fileInput);
		fileInput.onchange = (event) => {
			const files = event.target.files;
			if (!files || files.length === 0) {
				pop(null, E('p', _('No file selected.')), 'error');
				return;
			}
			self.uploadFiles(files); // Use the shared upload function
		};
		fileInput.click();
	},

	uploadFiles(files) {
		const self = this;
		const directoryPath = currentPath;
		const statusInfo = document.getElementById('status-info');
		const statusProgress = document.getElementById('status-progress');
		const totalFiles = files.length;
		let uploadedFiles = 0;

		function uploadNextFile(index) {
			if (index >= totalFiles) {
				self.loadFileList(currentPath).then(() => {
					
				});
				return;
			}

			const file = files[index];
			const fullFilePath = joinPath(directoryPath, file.name);
			if (statusInfo) {
				statusInfo.textContent = _('Uploading: "%s"...').format(file.name);
			}
			if (statusProgress) {
				statusProgress.innerHTML = '';
				const progressBarContainer = E('div', {
					'class': 'cbi-progressbar',
					'title': '0%'
				}, [E('div', {
					'style': 'width:0%'
				})]);
				statusProgress.appendChild(progressBarContainer);
			}

			uploadFile(fullFilePath, file, (percent) => {
				if (statusProgress) {
					const progressBar = statusProgress.querySelector('.cbi-progressbar div');
					if (progressBar) {
						progressBar.style.width = percent.toFixed(2) + '%';
						statusProgress.querySelector('.cbi-progressbar').setAttribute('title', percent.toFixed(2) + '%');
					}
				}
			}).then(() => {
				if (statusProgress) {
					statusProgress.innerHTML = '';
				}
				if (statusInfo) {
					statusInfo.textContent = _('File "%s" uploaded successfully.').format(file.name);
				}
				popTimeout(null, E('p', _('File "%s" uploaded successfully.').format(file.name)), 5000, 'info');
				uploadedFiles++;
				uploadNextFile(index + 1);
			}).catch((err) => {
				if (statusProgress) {
					statusProgress.innerHTML = '';
				}
				if (statusInfo) {
					statusInfo.textContent = _('Upload failed for file "%s": %s').format(file.name, err.message);
				}
				pop(null, E('p', _('Upload failed for file "%s": %s').format(file.name, err.message)), 'error');
				uploadNextFile(index + 1);
			});
		}
		uploadNextFile(0);
	},

	// Handler for creating a directory
	handleMakeDirectoryClick(ev) {
		// Logic to create a new directory
		const self = this;
		const statusInfo = document.getElementById('status-info');
		const statusProgress = document.getElementById('status-progress');
		if (statusInfo && statusProgress) {
			statusInfo.innerHTML = '';
			statusProgress.innerHTML = '';
			const dirNameInput = E('input', {
				'type': 'text',
				'placeholder': _('Directory Name'), 'class': 'cbi-input-text',
				'style': 'margin-right: 10px;'
			});
			const saveButton = E('button', {
				'class': 'cbi-button cbi-button-action',
				'disabled': true,
				'click'() {
					self.createDirectory(dirNameInput.value);
				}
			}, _('Save'));
			dirNameInput.addEventListener('input', () => {
				if (dirNameInput.value.trim()) {
					saveButton.disabled = false;
				} else {
					saveButton.disabled = true;
				}
			});
			statusInfo.appendChild(E('span', {}, _('Create Directory: ')));
			statusInfo.appendChild(dirNameInput);
			statusProgress.appendChild(saveButton);
		}
	},

	// Function to create a directory
	createDirectory(dirName) {
		// Execute the 'mkdir' command and update the interface
		const self = this;
		const trimmedDirName = dirName.trim();
		const dirPath = joinPath(currentPath, trimmedDirName);
		fs.exec('mkdir', [dirPath]).then((res) => {
			if (res.code !== 0) {
				return Promise.reject(new Error(res.stderr.trim()));
			}
			popTimeout(null, E('p', _('Directory "%s" created successfully.').format(trimmedDirName)), 5000, 'info');
			self.loadFileList(currentPath).then(() => {
				
			});
			const statusInfo = document.getElementById('status-info');
			const statusProgress = document.getElementById('status-progress');
			if (statusInfo) statusInfo.textContent = _('No directory selected.');
			if (statusProgress) statusProgress.innerHTML = '';
		}).catch((err) => {
			pop(null, E('p', _('Failed to create directory "%s": %s').format(trimmedDirName, err.message)), 'error');
		});
	},

	// Handler for creating a file
	handleCreateFileClick(ev) {
		// Logic to create a new file
		const self = this;
		const statusInfo = document.getElementById('status-info');
		const statusProgress = document.getElementById('status-progress');
		if (statusInfo && statusProgress) {
			statusInfo.innerHTML = '';
			statusProgress.innerHTML = '';
			const fileNameInput = E('input', {
				'type': 'text',
				'placeholder': _('File Name'), 'class': 'cbi-input-text',
				'style': 'margin-right: 10px;'
			});
			const createButton = E('button', {
				'class': 'cbi-button cbi-button-action',
				'disabled': true,
				'click'() {
					self.createFile(fileNameInput.value);
				}
			}, _('Create'));
			fileNameInput.addEventListener('input', () => {
				if (fileNameInput.value.trim()) {
					createButton.disabled = false;
				} else {
					createButton.disabled = true;
				}
			});
			statusInfo.appendChild(E('span', {}, _('Create File: ')));
			statusInfo.appendChild(fileNameInput);
			statusProgress.appendChild(createButton);
		}
	},

	// Function to create a file
	createFile(fileName) {
		// Execute the 'touch' command and update the interface
		const self = this;
		const trimmedFileName = fileName.trim();
		const filePath = joinPath(currentPath, trimmedFileName);
		fs.exec('touch', [filePath]).then((res) => {
			if (res.code !== 0) {
				return Promise.reject(new Error(res.stderr.trim()));
			}
			popTimeout(null, E('p', _('File "%s" created successfully.').format(trimmedFileName)), 5000, 'info');
			self.loadFileList(currentPath).then(() => {
				
			});
			const statusInfo = document.getElementById('status-info');
			const statusProgress = document.getElementById('status-progress');
			if (statusInfo) statusInfo.textContent = _('No file selected.');
			if (statusProgress) statusProgress.innerHTML = '';
		}).catch((err) => {
			pop(null, E('p', _('Failed to create file "%s": %s').format(trimmedFileName, err.message)), 'error');
		});
	},

	// Handler for checkbox state change on a file
	handleCheckboxChange(ev) {
		const cb = ev.target;
		const filePath = cb.dataset.filePath;

		cb.checked
			? selectedItems.add(filePath)
			: selectedItems.delete(filePath);

		this.updateDeleteSelectedButton();
		this.updateSelectAllCheckbox();
	},

	// Update the "Delete Selected" button
	updateDeleteSelectedButton() {
		const btn = document.getElementById('delete-selected-button');
		if (!btn) return;

		btn.style.display = selectedItems.size > 0 ? '' : 'none';
	},

	// Update the "Select All" checkbox state
	updateSelectAllCheckbox() {
		const selectAll = document.getElementById('select-all-checkbox');
		if (!selectAll) return;

		const checkboxes = [...document.querySelectorAll('.select-checkbox')];
		if (checkboxes.length === 0) {
			selectAll.checked = false;
			selectAll.indeterminate = false;
			return;
		}

		const total = checkboxes.length;
		const checked = checkboxes.filter(cb => cb.checked).length;

		selectAll.checked = checked === total;
		selectAll.indeterminate = checked > 0 && checked < total;
	},

	// Handler for the "Select All" checkbox change
	handleSelectAllChange(ev) {
		const checked = ev.target.checked;
		const checkboxes = [...document.querySelectorAll('.select-checkbox')];

		selectedItems.clear();

		checkboxes.forEach(cb => {
			cb.checked = checked;
			if (checked) selectedItems.add(cb.dataset.filePath);
		});

		this.updateDeleteSelectedButton();
		this.updateSelectAllCheckbox();
	},

	// Handler for deleting selected items
	handleDeleteSelected() {
		// Delete selected files and directories
		const self = this;
		if (selectedItems.size === 0) {
			return;
		}
		if (!confirm(_('Are you sure you want to delete the selected files and directories?'))) {
			return;
		}
		const promises = [];
		selectedItems.forEach((filePath) => {
			promises.push(fs.remove(filePath).catch((err) => {
				pop(null, E('p', _('Failed to delete %s: %s').format(filePath, err.message)), 'error');
			}));
		});
		Promise.all(promises).then(() => {
			popTimeout(null, E('p', _('Selected files and directories deleted successfully.')), 5000, 'info');
			selectedItems.clear();
			self.updateDeleteSelectedButton();
			self.loadFileList(currentPath).then(() => {
				
			});
		}).catch((err) => {
			pop(null, E('p', _('Failed to delete selected files and directories: %s').format(err.message)), 'error');
		});
	},

	// Function to load the file list
	loadFileList(path) {
		const self = this;
		selectedItems.clear();

		return getFileList(path).then(files => {
			// 1. Get column order dynamically from grid header
			const columns = ['cb', ...Array.from(
				document.querySelectorAll('#file-table .file-grid-header .file-cell[data-field]')
			).map(el => el.getAttribute('data-field'))];


			const fileList = document.getElementById('file-list');
			if (!fileList) {
				pop(null, E('p', _('Failed to display the file list.')), 'error');
				return;
			}

			fileList.innerHTML = '';
			files.sort(self.compareFiles.bind(self));

			//
			// Add ".." parent row
			//
			if (path !== '/') {
				const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';

				const tr = E('div', { 
					'data-file-path': parentPath,
					'data-file-type': 'directory'
				, 'class': 'file-grid-row'});

				// Create cells for *every* column
				for (const col of columns) {
					if (col === 'name') {
						tr.appendChild(
							E('div', { 'class': 'file-cell', 'style': 'grid-column: 2 / -1;' }, [
								E('a', {
									href: '#',
									click: () => self.handleDirectoryClick(parentPath)
								}, '.. (Parent Directory)')
							])
						);
						break;
					} else {
						tr.appendChild(E('div', { 'class': 'file-cell' })); // empty cell
					}
				}

				fileList.appendChild(tr);
			}

			//
			// 2. For each file, create row dynamically
			//
			for (const file of files) {
				const fullPath = joinPath(path, file.name);
				const tr = E('div', { 
					'data-file-path': fullPath,
					'data-file-type': file.type,
					'data-permissions': file.permissions,
					'data-numeric-permissions': file.numericPermissions,
					'data-owner': file?.user || file.uid,
					'data-group': file?.group || file.gid,
					'data-size': file.size
				, 'class': 'file-grid-row'});

				//
				// Prebuild common reusable items
				//
				const nameLink = E('a', {
					href: '#',
					title: file.permissions,
					class: `${file.type}-link`,
					click(event) {
						if (file.type === 'directory' || file?.target?.type === 'directory') {
							self.handleDirectoryClick(fullPath);
						} else {
							event.preventDefault();
							self.handleFileClick(fullPath, event.altKey ? 'hex' : 'text');
						}
					}
				}, file?.target ? `${file.name} → ${file.target?.name}` : file.name);

				const actions = [];
				const checkbox = E('input', {
					type: 'checkbox',
					class: 'select-checkbox',
					'data-file-path': fullPath,
					change: ev => self.handleCheckboxChange(ev)
				});
				/* checkbox separated */

				if (file.type === 'file') {
					actions.push(E('button', {
						class: 'btn cbi-button cbi-button-save',
						title: _('Download'),
						click: () => self.handleDownloadFile(fullPath)
					}, _('Download')));
				}

				actions.push(E('button', {
					class: 'btn cbi-button custom-rename-btn',
					title: _('Rename/Properties'),
					click: () => self.handleEditFile(fullPath, file)
				}, _('Rename')));

				actions.push(E('button', {
					class: 'cbi-button cbi-button-action',
					title: _('Duplicate'),
					click: () => self.handleDuplicateFile(fullPath, file)
				}, _('Copy')));

				actions.push(E('button', {
					class: 'cbi-button cbi-button-remove',
					title: _('Delete'),
					click: () => self.handleDeleteFile(fullPath, file)
				}, _('Delete')));

				//
				// 3. Build `<td>` dynamically based on column definitions
				//
				for (const col of columns) {
					let td;

					switch (col) {
						case 'cb':
							td = E('div', { 'class': 'file-cell cell-center' }, [checkbox]);
							break;

						case 'name':
							td = E('div', { 'class': 'file-cell' }, [nameLink]);
							break;

						case 'type':
							td = E('div', { 'class': 'file-cell' }, fileTypes[file.type] || file.type);
							break;

						case 'size':
							if (file.type === 'directory' || (file.type === 'symlink' && file.size === -1)) {
								td = E('div', { 'class': 'file-cell cell-right size-cell' }, [
									E('span', { class: 'size-number' }, '-'),
									E('span', { class: 'size-unit' }, ''),
								]);
							} else {
								const formatted = self.getFormattedSize(file.size);
								td = E('div', { 'class': 'file-cell cell-right size-cell' }, [
									E('span', { class: 'size-number' }, formatted.number),
									E('span', { class: 'size-unit' }, formatted.unit)
								]);
							}
							break;

						case 'mtime':
							td = E('div', { 'class': 'file-cell cell-right' }, new Date(file.mtime * 1000).toLocaleString());
							break;

						case 'actions':
							td = E('div', { 'class': 'file-cell cell-right' }, [E('div', { 'class': 'action-button-group' }, actions)]);
							break;

						case 'permissions':
							td = E('div', { 'class': 'file-cell' }, file.permissions);
							break;

						default:
							// Support future dynamically-added columns
							td = E('div', {}, file[col] ?? '');
							break;
					}

					tr.appendChild(td);
				}

				fileList.appendChild(tr);
			}

			//
			// housekeeping
			//
			const statusInfo = document.getElementById('status-info');
			const statusProgress = document.getElementById('status-progress');

			if (statusInfo) statusInfo.textContent = _('No file selected.');
			if (statusProgress) statusProgress.innerHTML = '';

			
			self.updateSelectAllCheckbox();
			self.updateDeleteSelectedButton();
			return Promise.resolve();
		}).catch((err) => {
			pop(null, E('p', _('Failed to load file list: %s').format(err.message)), 'error');
			return Promise.reject(err);
		});
	},

	// Function to format file size
	getFormattedSize(size) {
		/* 64 bit systems i.e. rpcd have max size of 128 TB */
		const units = [' ', 'K', 'M', 'G', 'T'];
		let index = 0;
		let value = size;

		if (size > 0) {
			// Keep dividing until below 1024 or no more units
			while (value >= 1024 && index < units.length - 1) {
				value /= 1024;
				index++;
			}
		}

		// Format to 2 decimals, always 6 chars wide
		const num = value.toFixed(2).padStart(6, ' ');

		return {
			number: num,
			unit: ' ' + units[index] + 'B'
		};
	},

	// Function to sort files
	sortBy(field) {
		// Change the sort field and direction, and reload the file list
		if (sortField === field) {
			sortAscending = !sortAscending;
		} else {
			sortField = field;
			sortAscending = true;
		}
		this.loadFileList(currentPath);
	},

	// Function to compare files for sorting
	compareFiles(a, b) {
		// Compare files based on the selected field and direction
		const order = sortAscending ? 1 : -1;
		let aValue = a[sortField];
		let bValue = b[sortField];
		if (sortField === 'size') {
			aValue = (a.type === 'directory' || (a.type === 'symlink' && a.size === -1)) ? -1 : a.size;
			bValue = (b.type === 'directory' || (b.type === 'symlink' && b.size === -1)) ? -1 : b.size;
		}
		if (aValue < bValue) return -1 * order;
		if (aValue > bValue) return 1 * order;
		return 0;
	},

	

	// Handler for clicking on a directory
	handleDirectoryClick(newPath) {
		// Navigate to the selected directory and update the file list
		const self = this;
		currentPath = newPath || '/';
		const pathInput = document.getElementById('path-input');
		if (pathInput) {
			pathInput.value = currentPath;
		}
		this.loadFileList(currentPath).then(() => {
			
		});
	},

	/**
	 * Determines whether a given Uint8Array represents UTF-8 text data.
	 *
	 * @param {Uint8Array} uint8Array - The binary data to check.
	 * @returns {boolean} - Returns true if the data is UTF-8 text, false otherwise.
	 */
	isText(uint8Array) {

		const len = uint8Array.length;
		let i = 0;

		while (i < len) {
			const byte = uint8Array[i];

			if (byte === 0) return false; // Null byte indicates binary

			if (byte <= 0x7F) {
				// ASCII character, no action needed
				i++;
				continue;
			} else if ((byte & 0xE0) === 0xC0) {
				// 2-byte sequence
				if (i + 1 >= len || (uint8Array[i + 1] & 0xC0) !== 0x80) return false;
				i += 2;
			} else if ((byte & 0xF0) === 0xE0) {
				// 3-byte sequence
				if (
					i + 2 >= len ||
					(uint8Array[i + 1] & 0xC0) !== 0x80 ||
					(uint8Array[i + 2] & 0xC0) !== 0x80
				) {
					return false;
				}
				i += 3;
			} else if ((byte & 0xF8) === 0xF0) {
				// 4-byte sequence
				if (
					i + 3 >= len ||
					(uint8Array[i + 1] & 0xC0) !== 0x80 ||
					(uint8Array[i + 2] & 0xC0) !== 0x80 ||
					(uint8Array[i + 3] & 0xC0) !== 0x80
				) {
					return false;
				}
				i += 4;
			} else {
				// Invalid UTF-8 byte
				return false;
			}
		}

		return true;
	},

	// Function to handle clicking on a file to open it in the editor
	handleFileClick(filePath, mode) {
		const self = this;
		const fileRow = document.querySelector(`tr[data-file-path='${filePath}']`);
		const editorMessage = document.getElementById('editor-message');

		// Set original file permissions
		self.originalFilePermissions = fileRow ? fileRow.getAttribute('data-numeric-permissions') : '644';
		self.editorMode = mode;

		// Display loading message
		if (editorMessage) editorMessage.textContent = _('Loading file...');

		// Read the file as binary data
		fs.read_direct(filePath, 'blob')
			.then(blob => blob.arrayBuffer())
			.then(arrayBuffer => {
				const uint8Array = new Uint8Array(arrayBuffer);
				self.fileData = uint8Array;
				self.fileContent = ''; // Can be used for display or left empty
				self.editorMode = 'hex';
				self.textType = self.isText(uint8Array) ? 'text' : 'hex';
				if (mode === 'text') {
					// Determine if the file is text
					if (self.textType === 'text') {
						// If text, decode the content
						self.fileContent = new TextDecoder().decode(uint8Array);
						self.editorMode = 'text';
					} else {
						// If not text, show a warning and set mode to hex
						if (editorMessage) {
							editorMessage.textContent = _('The file does not contain valid text data. Opening in hex mode...');
						}
						pop(null, E('p', _('Opening file in hex mode since it is not a text file.')), 'warning');
					}
				}
			})
			.then(() => {
				// Render the editor and switch to the editor tab
				self.renderEditor(filePath);
				self.switchToTab('editor');
			})
			.catch(err => {
				// Handle errors during file reading
				pop(null, E('p', _('Failed to open file: %s').format(err.message)), 'error');
			});
	},
	// Adjust padding for line numbers in the editor
	adjustLineNumbersPadding() {
		// Update padding based on scrollbar size
		const lineNumbersDiv = document.getElementById('line-numbers');
		const editorTextarea = document.getElementById('editor-textarea');
		if (!lineNumbersDiv || !editorTextarea) {
			return;
		}
		const scrollbarHeight = editorTextarea.offsetHeight - editorTextarea.clientHeight;
		lineNumbersDiv.style.paddingBottom = scrollbarHeight + 'px';
	},

	// Handler for downloading a file
	handleDownloadFile(filePath) {
		// Download the file to the user's local machine
		const self = this;
		const fileName = filePath.split('/').pop();
		// Use the read_direct method to download the file
		fs.read_direct(filePath, 'blob')
			.then((blob) => {
				if (!(blob instanceof Blob)) {
					throw new Error(_('Response is not a Blob'));
				}
				const url = window.URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = fileName;
				document.body.appendChild(a);
				a.click();
				a.remove();
				window.URL.revokeObjectURL(url);
			}).catch((err) => {
				pop(null, E('p', _('Failed to download file "%s": %s').format(fileName, err.message)), 'error');
			});
	},

	// Handler for deleting a file
	handleDeleteFile(filePath, fileInfo) {
		// Delete the selected file or directory
		const self = this;
		const itemName = filePath.split('/').pop();
		const itemTypeLabel = fileTypes[fileInfo?.type];

		if (confirm(_('Are you sure you want to delete this %s: "%s"?').format(itemTypeLabel, itemName))) {
			fs.remove(filePath).then(() => {
				popTimeout(null, E('p', _('Successfully deleted %s: "%s".').format(itemTypeLabel, itemName)), 5000, 'info');
				self.loadFileList(currentPath).then(() => {
					
				});
				const statusInfo = document.getElementById('status-info');
				if (statusInfo) {
					statusInfo.textContent = _('Deleted %s: "%s".').format(itemTypeLabel, itemName);
				}
			}).catch((err) => {
				pop(null, E('p', _('Failed to delete %s "%s": %s').format(itemTypeLabel, itemName, err.message)), 'error');
			});
		}
	},

	// Update line numbers in the text editor
	updateLineNumbers() {
		// Update the line numbers display when the text changes
		const lineNumbersDiv = document.getElementById('line-numbers');
		const editorTextarea = document.getElementById('editor-textarea');
		if (!lineNumbersDiv || !editorTextarea) return;

		// Count lines
		const lineCount = editorTextarea.value.split('\n').length;

		// Build HTML using join — much faster than concatenation
		lineNumbersDiv.innerHTML = Array.from({ length: lineCount }, (_, i) => `<div>${i + 1}</div>`).join('');
	},

	// Synchronize scrolling between line numbers and text
	syncScroll() {
		// Sync scrolling of line numbers with the text area
		const lineNumbersDiv = document.getElementById('line-numbers');
		const editorTextarea = document.getElementById('editor-textarea');
		if (!lineNumbersDiv || !editorTextarea) {
			return;
		}
		lineNumbersDiv.scrollTop = editorTextarea.scrollTop;
	},

	// Toggle line numbers display in the editor
	toggleLineNumbers() {
		// Ensure the editor is in Text Mode before toggling line numbers
		if (this.editorMode !== 'text') {
			console.warn('Toggle Line Numbers is only available in Text Mode.');
			return;
		}

		// Get the line numbers div and the textarea
		const lineNumbersDiv = document.getElementById('line-numbers');
		const editorTextarea = document.getElementById('editor-textarea');
		if (!lineNumbersDiv || !editorTextarea) {
			console.error('Line numbers div or editor textarea not found.');
			return;
		}

		// Toggle the display of line numbers
		if (lineNumbersDiv.style.display === 'none' || !lineNumbersDiv.style.display) {
			lineNumbersDiv.style.display = 'block';
			this.updateLineNumbers();
			this.adjustLineNumbersPadding();
			this.syncScroll();
		} else {
			lineNumbersDiv.style.display = 'none';
			lineNumbersDiv.innerHTML = '';
		}
	},

	// Generate a name for a copy of a file
	getCopyName(originalName, existingNames) {
		// Split filename into base name + extension
		const dotIndex = originalName.lastIndexOf('.');
		const hasExt = dotIndex > 0 && dotIndex < originalName.length - 1;

		const base = hasExt ? originalName.slice(0, dotIndex) : originalName;
		const ext  = hasExt ? originalName.slice(dotIndex) : '';

		// First attempt: "name (copy).ext"
		let candidate = `${base} (copy)${ext}`;

		// If taken, try: "name (copy 2).ext", "name (copy 3).ext", ...
		let counter = 2;
		while (existingNames.includes(candidate)) {
			candidate = `${base} (copy ${counter++})${ext}`;
		}

		return candidate;
	},

	// Handler for duplicating a file
	handleDuplicateFile(filePath, fileInfo) {
		// Copy the file or directory with a new name
		const self = this;
		getFileList(currentPath).then((files) => {
			const existingNames = files.map((f) => {
				return f.name;
			});
			const newName = self.getCopyName(fileInfo.name, existingNames);
			const newPath = joinPath(currentPath, newName);
			let command;
			let args;
			if (fileInfo.type === 'directory') {
				command = 'cp';
				args = ['-rp', filePath, newPath];
			} else if (fileInfo.type === 'symlink') {
				command = 'cp';
				args = ['-Pp', filePath, newPath];
			} else {
				command = 'cp';
				args = ['-p', filePath, newPath];
			}
			fs.exec(command, args).then((res) => {
				if (res.code !== 0) {
					return Promise.reject(new Error(res.stderr.trim()));
				}
				popTimeout(null, E('p', _('Successfully duplicated %s "%s" as "%s".').format(_('item'), fileInfo.name, newName)), 5000, 'info');
				self.loadFileList(currentPath).then(() => {
					
				});
			}).catch((err) => {
				pop(null, E('p', _('Failed to duplicate %s "%s": %s').format(_('item'), fileInfo.name, err.message)), 'error');
			});
		}).catch((err) => {
			pop(null, E('p', _('Failed to get file list: %s').format(err.message)), 'error');
		});
	},

	// Handler for saving a file after editing
	handleSaveFile(filePath) {
		const self = this;
		let contentBlob;

		if (self.editorMode === 'text') {
			const textarea = document.querySelector('#editor-container textarea');
			if (!textarea) {
				pop(null, E('p', _('Editor textarea not found.')), 'error');
				return;
			}
			const content = textarea.value;
			self.fileContent = content;

			// Convert content to Uint8Array in chunks not exceeding 8KB
			const CHUNK_SIZE = 8 * 1024; // 8KB
			const totalLength = content.length;
			let chunks = [];
			for (let i = 0; i < totalLength; i += CHUNK_SIZE) {
				const chunkStr = content.slice(i, i + CHUNK_SIZE);
				const chunkBytes = new TextEncoder().encode(chunkStr);
				chunks.push(chunkBytes);
			}
			// Concatenate chunks into a single Uint8Array
			const totalBytes = chunks.reduce((prev, curr) => {
				return prev + curr.length;
			}, 0);
			let dataArray = new Uint8Array(totalBytes);
			let offset = 0;
			chunks.forEach((chunk) => {
				dataArray.set(chunk, offset);
				offset += chunk.length;
			});
			self.fileData = dataArray; // Update binary data

			contentBlob = new Blob([self.fileData], {
				type: 'application/octet-stream'
			});
		} else if (self.editorMode === 'hex') {
			// Get data from hex editor
			self.fileData = self.hexEditorInstance.getData(); // Assuming getData method is implemented in HexEditor
			contentBlob = new Blob([self.fileData], {
				type: 'application/octet-stream'
			});
		}

		const statusInfo = document.getElementById('status-info');
		const statusProgress = document.getElementById('status-progress');
		const fileName = filePath.split('/').pop();
		if (statusInfo) {
			statusInfo.textContent = _('Saving file: "%s"...').format(fileName);
		}
		if (statusProgress) {
			statusProgress.innerHTML = '';
			const progressBarContainer = E('div', {
				'class': 'cbi-progressbar',
				'title': '0%'
			}, [E('div', {
				'style': 'width:0%'
			})]);
			statusProgress.appendChild(progressBarContainer);
		}

		uploadFile(filePath, contentBlob, (percent) => {
			if (statusProgress) {
				const progressBar = statusProgress.querySelector('.cbi-progressbar div');
				if (progressBar) {
					progressBar.style.width = percent.toFixed(2) + '%';
					statusProgress.querySelector('.cbi-progressbar').setAttribute('title', percent.toFixed(2) + '%');
				}
			}
		}).then(() => {
			const permissions = self.originalFilePermissions;
			if (permissions !== undefined) {
				return fs.exec('chmod', [permissions, filePath]).then((res) => {
					if (res.code !== 0) {
						throw new Error(res.stderr.trim());
					}
				}).then(() => {
					if (statusInfo) {
						statusInfo.textContent = _('File "%s" uploaded successfully.').format(fileName);
					}
					popTimeout(null, E('p', _('File "%s" uploaded successfully.').format(fileName)), 5000, 'info');
					return self.loadFileList(currentPath).then(() => {
						
					});
				}).catch((err) => {
					pop(null, E('p', _('Failed to apply permissions to file "%s": %s').format(fileName, err.message)), 'error');
				});
			} else {
				if (statusInfo) {
					statusInfo.textContent = _('File "%s" uploaded successfully.').format(fileName);
				}
				popTimeout(null, E('p', _('File "%s" uploaded successfully.').format(fileName)), 5000, 'info');
				return self.loadFileList(currentPath).then(() => {
					
				});
			}
		}).catch((err) => {
			if (statusProgress) {
				statusProgress.innerHTML = '';
			}
			if (statusInfo) {
				statusInfo.textContent = _('Failed to save file "%s": %s').format(fileName, err.message);
			}
			pop(null, E('p', _('Failed to save file "%s": %s').format(fileName, err.message)), 'error');
		});
	},

	// Handler for clicking on a symbolic link
	handleSymlinkClick(linkPath, targetPath, mode) {
		// Navigate to the target of the symbolic link
		const self = this;
		if (!targetPath.startsWith('/')) {
			targetPath = joinPath(currentPath, targetPath);
		}
		fs.stat(targetPath).then((stat) => {
			if (stat.type === 'directory') {
				self.handleDirectoryClick(targetPath);
			} else if (stat.type === 'file') {
				self.handleFileClick(targetPath, mode);
			} else {
				pop(null, E('p', _('The symlink points to an unsupported type.')), 'error');
			}
		}).catch((err) => {
			pop(null, E('p', _('Failed to access symlink target: %s').format(err.message)), 'error');
		});
		const statusInfo = document.getElementById('status-info');
		if (statusInfo) {
			statusInfo.textContent = _('Symlink: ') + linkPath + ' -> ' + targetPath;
		}
	},

	

	// Handler for editing a file's properties (name, permissions, etc.)
	handleEditFile(filePath, fileInfo) {
		// Display a form to edit the file's properties
		const self = this;
		const statusInfo = document.getElementById('status-info');
		const statusProgress = document.getElementById('status-progress');
		if (statusInfo && statusProgress) {
			statusInfo.innerHTML = '';
			statusProgress.innerHTML = '';
			const nameInput = E('input', {
				'type': 'text',
				'value': fileInfo.name,
				'placeholder': fileInfo.name,
				'style': 'margin-right: 10px;'
			});
			const permsInput = E('input', {
				'type': 'text',
				'placeholder': fileInfo.numericPermissions,
				'style': 'margin-right: 10px; width: 80px;'
			});
			const ownerInput = E('input', {
				'type': 'text',
				'placeholder': fileInfo?.user || fileInfo.uid,
				'style': 'margin-right: 10px; width: 100px;'
			});
			const groupInput = E('input', {
				'type': 'text',
				'placeholder': fileInfo?.group || fileInfo.gid,
				'style': 'margin-right: 10px; width: 100px;'
			});
			const saveButton = E('button', {
				'class': 'cbi-button cbi-button-action',
				'disabled': true,
				'click'() {
					self.saveFileChanges(filePath, fileInfo, nameInput.value, permsInput.value, ownerInput.value, groupInput.value);
				}
			}, _('Save'));
			[nameInput, permsInput, ownerInput, groupInput].forEach((input) => {
				input.addEventListener('input', () => {
					if (nameInput.value !== fileInfo.name || permsInput.value || ownerInput.value || groupInput.value) {
						saveButton.disabled = false;
					} else {
						saveButton.disabled = true;
					}
				});
			});
			statusInfo.appendChild(E('span', {}, _('Editing %s: "%s"').format(_('item'), fileInfo.name)));
			statusInfo.appendChild(nameInput);
			statusInfo.appendChild(permsInput);
			statusInfo.appendChild(ownerInput);
			statusInfo.appendChild(groupInput);
			statusProgress.appendChild(saveButton);

			// Scroll to the status bar and highlight it
			const statusBar = document.getElementById('status-bar');
			if (statusBar) {
				statusBar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				statusBar.style.background = '#fff3cd';
				setTimeout(() => { statusBar.style.background = ''; }, 2000);
			}
		}
	},

	// Save changes to a file's properties
	saveFileChanges(filePath, fileInfo, newName, newPerms, newOwner, newGroup) {
		// Apply changes and update the interface
		const self = this;
		const commands = [];
		const originalPath = filePath;
		const originalName = fileInfo.name;
		const newItemName = newName || originalName;

		if (newName && newName !== fileInfo.name) {
			const newPath = joinPath(currentPath, newName);
			commands.push(['mv', [filePath, newPath]]);
			filePath = newPath;
		}
		if (newPerms) {
			commands.push(['chmod', [newPerms, filePath]]);
		}

		if (newOwner || newGroup) {
			const owner = newOwner ?? (fileInfo?.user || fileInfo.uid);
			const group = newGroup ?? (fileInfo?.group || fileInfo.gid);

			commands.push(['chown', [`${owner}:${group}`, filePath]]);
		}

		let promise = Promise.resolve();
		commands.forEach((cmd) => {
			promise = promise.then(() => {
				return fs.exec(cmd[0], cmd[1]).then((res) => {
					if (res.code !== 0) {
						return Promise.reject(new Error(res.stderr.trim()));
					}
				});
			});
		});
		promise.then(() => {
			popTimeout(null, E('p', _('Changes to %s "%s" uploaded successfully.').format(_('item'), newItemName)), 5000, 'info');
			self.loadFileList(currentPath).then(() => {
				
			});
			const statusInfo = document.getElementById('status-info');
			const statusProgress = document.getElementById('status-progress');
			if (statusInfo) statusInfo.textContent = _('No item selected.');
			if (statusProgress) statusProgress.innerHTML = '';
		}).catch((err) => {
			pop(null, E('p', _('Failed to save changes to %s "%s": %s').format(_('item'), newItemName, err.message)), 'error');
		});
	},



	renderEditor(filePath) {
		const self = this;

		const editorContainer = document.getElementById('editor-container');

		// Clear the editor container
		editorContainer.innerHTML = '';

		// Get the sizes from the config
		const mode = self.editorMode; // 'text' or 'hex'
		const editorHeight = config[`${mode}editorHeight`] || 550;

		// Create the editor content container
		const editorContentContainer = E('div', {
			'class': 'editor-content',
			'style': 'flex: 1; display: flex; overflow: hidden;'
		}, []);

		// Action buttons array
		let actionButtons = [];

		if (mode === 'text') {
			// Create line numbers div (initially hidden)
			const lineNumbersDiv = E('div', {
				'id': 'line-numbers',
				'class': 'line-numbers',
				'style': 'display: none;' // Initially hidden
			}, []);

			// Create textarea for text editing
			const editorTextarea = E('textarea', {
				'wrap': 'off',
				'id': 'editor-textarea',
				'style': 'flex: 1; resize: none; border: none; padding: 0; margin: 0; overflow: auto;'
			}, [self.fileContent || '']);

			// Append line numbers and textarea to the editor content container
			editorContentContainer.appendChild(lineNumbersDiv);
			editorContentContainer.appendChild(editorTextarea);

			// Add event listeners for updating line numbers and synchronizing scroll
			editorTextarea.addEventListener('input', self.updateLineNumbers.bind(self));
			editorTextarea.addEventListener('scroll', self.syncScroll.bind(self));
			lineNumbersDiv.addEventListener('scroll', () => {
				editorTextarea.scrollTop = lineNumbersDiv.scrollTop;
			});

			// Define action buttons specific to Text Mode
			actionButtons = [
				E('button', {
					'class': 'cbi-button cbi-button-save custom-save-button',
					'click'() {
						self.handleSaveFile(filePath);
					}
				}, _('Save')),
				E('button', {
					'class': 'cbi-button cbi-button-action',
					'id': 'toggle-hex-mode',
					'style': 'margin-left: 10px;',
					'click'() {
						self.toggleHexMode(filePath);
					}
				}, _('Toggle to Hex Mode')),
				E('button', {
					'class': 'cbi-button cbi-button-action',
					'id': 'toggle-line-numbers',
					'style': 'margin-left: 10px;',
					'click'() {
						self.toggleLineNumbers();
					}
				}, _('Toggle Line Numbers'))
			];
		} else if (mode === 'hex') {
			// Create hex editor container
			const hexeditContainer = E('div', {
				'id': 'hexedit-container',
				'style': 'flex: 1; overflow: hidden; display: flex; flex-direction: column;'
			});

			// Append hex editor to the editor content container
			editorContentContainer.appendChild(hexeditContainer);

			// Initialize the HexEditor instance

			self.hexEditorInstance = HE.initialize(hexeditContainer);

			// Load data into the HexEditor
			self.hexEditorInstance.setData(self.fileData); // self.fileData is a Uint8Array

			// Define action buttons specific to Hex Mode
			actionButtons = [
				E('button', {
					'class': 'cbi-button cbi-button-save custom-save-button',
					'click'() {
						self.handleSaveFile(filePath);
					}
				}, _('Save')),
				...(self.textType !== 'hex' ? [
					E('button', {
						'class': 'cbi-button cbi-button-action',
						'id': 'toggle-text-mode',
						'style': 'margin-left: 10px;',
						'click'() {
							self.toggleHexMode(filePath);
						}
					}, _('Toggle to ASCII Mode'))
				] : [])
			];
		}

		// Create the editor container with resizing and scrolling
		const editor = E('div', {
			'class': 'editor-container',
			'style': 'display: flex; flex-direction: column; height: ' + editorHeight + 'px; resize: both; overflow: hidden;'
		}, [
			editorContentContainer,
			E('div', {
				'class': 'cbi-page-actions'
			}, actionButtons)
		]);

		// Append the editor to the editorContainer
		editorContainer.appendChild(editor);

		// Update status bar and message
		const statusInfo = document.getElementById('status-info');
		if (statusInfo) {
			statusInfo.textContent = _('Editing: ') + filePath;
		}
		const editorMessage = document.getElementById('editor-message');
		if (editorMessage) {
			editorMessage.textContent = _('Editing: ') + filePath;
		}

		// Clear any progress messages
		const statusProgress = document.getElementById('status-progress');
		if (statusProgress) {
			statusProgress.innerHTML = '';
		}

		// **Add ResizeObserver to editor-container to update config.editorContainerSizes**
		if (typeof ResizeObserver !== 'undefined') {
			// Disconnect existing observer if it exists to prevent multiple observers
			if (self.editorResizeObserver) {
				self.editorResizeObserver.disconnect();
				self.editorResizeObserver = null;
			}

			// Initialize a new ResizeObserver instance
			self.editorResizeObserver = new ResizeObserver((entries) => {
				for (let entry of entries) {
					let newHeight = Math.round(entry.contentRect.height);

					// Update config only if newWidth and newHeight are greater than 0
					if (newHeight > 0) {
						config.editorHeight = newHeight;
					}
				}
			});

			// Observe the editor container
			self.editorResizeObserver.observe(editor);
		}
	},

	/**
	 * Toggles the editor mode between text and hex.
	 *
	 * @param {string} filePath - The path of the file to be edited.
	 */
	toggleHexMode(filePath) {
		const self = this;

		if (self.editorMode === 'text') {
			// Before switching to hex mode, update self.fileData from the textarea
			const textarea = document.querySelector('#editor-container textarea');
			if (textarea) {
				const content = textarea.value;
				self.fileContent = content;

				// Convert content to Uint8Array
				const encoder = new TextEncoder();
				self.fileData = encoder.encode(content);
			}
			self.editorMode = 'hex';
		} else {
			// Before switching to text mode, check if the file is textual
			if (self.textType !== 'text') {
				pop(null, E('p', _('This file is not a text file and cannot be edited in text mode.')), 'error');
				return; // Abort the toggle
			}

			// Before switching to text mode, update self.fileData from HexEditor
			if (self.hexEditorInstance) {
				const hexData = self.hexEditorInstance.getData();
				if (hexData instanceof Uint8Array) {
					self.fileData = hexData;
				} else {
					pop(null, E('p', _('Failed to retrieve data from Hex Editor.')), 'error');
					return; // Abort the toggle if data retrieval fails
				}
			}

			// Convert self.fileData to string
			const decoder = new TextDecoder();
			try {
				self.fileContent = decoder.decode(self.fileData);
			} catch (error) {
				pop(null, E('p', _('Failed to decode file data to text: %s').format(error.message)), 'error');
				return; // Abort the toggle if decoding fails
			}
			self.editorMode = 'text';
		}

		// Re-render the editor with the updated mode and content
		self.renderEditor(filePath);
	}

});
