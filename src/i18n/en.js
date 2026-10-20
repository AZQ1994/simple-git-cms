// English. Keys are documented in src/i18n/index.js; {xxx} are placeholders.
export default {
  'lang.name': 'English',

  // Sign-in
  'login.subtitle': 'Write and publish {collection}',
  'login.github': 'Sign in with GitHub',
  'login.tokenSummary': 'Sign in with an access token',
  'login.tokenSubmit': 'Sign in',
  'login.tokenHint': 'Create one under GitHub → Settings → Developer settings → Fine-grained tokens, with the repository permission Contents: Read and write.',
  'login.failed': 'Sign-in failed: {error}',
  'login.expired': 'Your session has expired. Please sign in again.',
  'login.noAccess': 'The account {login} cannot edit this site’s repository. You need to be a collaborator with Write access, and the GitHub App used to sign in must be installed on the repository. Please contact the administrator.',

  // Sidebar
  'list.new': 'New article',
  'list.search': 'Search articles',
  'list.openAria': 'Article list',
  'list.empty': 'No articles match.',
  'list.untitled': '(untitled)',
  'filter.all': 'All',
  'filter.live': 'Published',
  'filter.draft': 'Drafts',
  'user.logout': 'Sign out',
  'user.language': 'Language',

  // Top bar
  'bar.viewLive': 'View on site',
  'bar.delete': 'Delete',
  'bar.unpublish': 'Revert to draft',
  'bar.preview': 'Preview',
  'bar.saveDraft': 'Save draft',
  'bar.publish': 'Publish',
  'bar.update': 'Update',

  // Status
  'status.new': 'New article',
  'status.live': 'Published',
  'status.draft': 'Draft',
  'status.unsaved': 'unsaved',

  // Empty state
  'empty.hint': 'Pick an article on the left, or start a new one.',

  // Article fields
  'doc.titlePlaceholder': 'Title',
  'doc.date': 'Date',
  'doc.tags': 'Tags',
  'doc.addTag': 'Add a tag',
  'doc.removeTag': 'Remove tag {tag}',
  'doc.seo': 'Search summary',
  'doc.descPlaceholder': 'The blurb shown in search results (roughly 60–160 characters). Left empty, it is taken from the start of the article.',
  'doc.descAuto': 'automatic',
  'doc.descCount': '{n} characters',

  // Toolbar
  'toolbar.h2': 'Heading',
  'toolbar.bold': 'Bold (⌘B)',
  'toolbar.italic': 'Italic (⌘I)',
  'toolbar.bulletList': 'Bulleted list',
  'toolbar.orderedList': 'Numbered list',
  'toolbar.blockquote': 'Quote',
  'toolbar.link': 'Link',
  'toolbar.image': 'Insert images (pick several to place them side by side)',
  'toolbar.imageLabel': 'Image',
  'toolbar.undo': 'Undo (⌘Z)',
  'toolbar.redo': 'Redo (⇧⌘Z)',
  'toolbar.linkPrompt': 'Link address (leave empty to remove the link)',
  'doc.footHint': 'Paste or drop images straight in. Click an image to crop it, add a caption, or place it side by side.',

  // Images
  'img.crop': 'Crop / rotate',
  'img.caption': 'Caption',
  'img.side': 'Side by side',
  'img.replace': 'Replace',
  'img.captionPlaceholder': 'Caption (shown below the image)',
  'img.captionSubmit': 'OK',
  'img.layoutAlone': 'On its own row',
  'img.layoutSide': 'Beside the previous one',
  'img.processing': 'Processing {n} images…',
  'img.processingOne': 'Processing image…',
  'img.notImage': 'Only images can be uploaded.',
  'img.tooLarge': 'The image is larger than {mb}MB.',
  'img.compressFailed': 'Could not compress the image.',

  // Crop dialog
  'crop.free': 'Free',
  'crop.rotateLeft': 'Rotate left',
  'crop.rotateRight': 'Rotate right',
  'crop.reset': 'Reset',
  'crop.cancel': 'Cancel',
  'crop.apply': 'Done',

  // Validation
  'validate.title': 'Please fill in the title.',
  'validate.body': 'Please write the article.',
  'validate.tags': 'Please add at least one tag.',
  'validate.externalImage': 'The article links to an image hosted elsewhere (probably pasted from another page). Download it and upload it again with the Image button.',

  // Saving
  'save.saving': 'Saving…',
  'save.updating': 'Updating…',
  'save.publishing': 'Publishing…',
  'save.unpublishing': 'Reverting…',
  'save.deleting': 'Deleting…',
  'save.loading': 'Loading…',
  'save.draftSaved': 'Draft saved',
  'done.create': 'Created — the site updates in about a minute.',
  'done.update': 'Updated — the site updates in about a minute.',
  'done.publish': 'Published — the site updates in about a minute.',
  'done.unpublish': 'Reverted to draft — the site updates in about a minute.',
  'save.deleted': 'Deleted',
  'save.busyRepo': 'Could not save: the repository is being updated too often right now. Please try again shortly.',
  'save.discardConfirm': 'You have unsaved changes. Discard them?',
  'save.publishConfirm': 'Once published, anyone can read this article on the site. Publish it?',
  'save.unpublishConfirm': 'Reverting hides this article from the site; the content is kept as a draft. Revert it?',
  'save.deleteConfirm': 'Permanently delete the draft “{title}”?',

  // Action names (also used in commit messages)
  'verb.create': 'Create',
  'verb.update': 'Update',
  'verb.publish': 'Publish',
  'verb.unpublish': 'Unpublish',

  // Commit messages
  'commit.article': '{verb} article: {title}',
  'commit.delete': 'Delete draft: {title}',

  // Conflicts
  'conflict.title': 'Someone else has changed this article',
  'conflict.theirsText': 'Since you opened it, someone saved a new version (title: {title}).',
  'conflict.deletedText': 'Since you opened it, this article has been deleted.',
  'conflict.cancel': 'Cancel',
  'conflict.theirs': 'Load their version',
  'conflict.mine': 'Overwrite with mine',

  // Preview
  'preview.title': 'Preview',
  'preview.hint': 'Exactly how it will look once published — unsaved content included',
  'preview.desktop': 'Desktop',
  'preview.phone': 'Phone',
  'preview.close': 'Close',
  'preview.loadFailed': 'Could not load the preview component. Check your connection and try again.',

  // Deployment
  'deploy.pending': 'Updating the site…',
  'deploy.success': 'Site updated',
  'deploy.failure': 'The site update failed. Please contact the administrator.',

  // Config / GitHub
  'config.missing': 'config.json not found',
  'config.incomplete': 'config.json is missing repo / collection.dir / media.dir / auth.base',
  'config.defaultTitle': 'Content',
  'config.defaultCollection': 'articles',
  'github.error': 'GitHub: {message}',
  'github.requestFailed': 'The GitHub request failed ({status}).',
};
