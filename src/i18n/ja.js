// Japanese. See src/i18n/index.js for the keys; {xxx} are placeholders.
// 日本語。キーは src/i18n/index.js を参照。{xxx} は置き換えられる部分。
export default {
  'lang.name': '日本語',

  // ログイン
  'login.subtitle': '{collection}の編集と公開',
  'login.github': 'GitHub でログイン',
  'login.tokenSummary': 'アクセストークンでログイン',
  'login.tokenSubmit': 'ログイン',
  'login.tokenHint': 'GitHub → Settings → Developer settings → Fine-grained tokens で発行し、リポジトリ権限は Contents: Read and write を選んでください。',
  'login.failed': 'ログインに失敗しました：{error}',
  'login.expired': 'ログインの有効期限が切れました。もう一度ログインしてください。',
  'login.noAccess': 'アカウント {login} にはこのサイトのリポジトリを編集する権限がありません。リポジトリの共同作業者（Write）に追加され、ログインに使う GitHub App がこのリポジトリにインストールされている必要があります。管理者にご連絡ください。',

  // サイドバー
  'list.new': '新規作成',
  'list.search': '記事を検索',
  'list.openAria': '記事一覧',
  'list.empty': '条件に合う記事がありません',
  'list.untitled': '（無題）',
  'filter.all': 'すべて',
  'filter.live': '公開済み',
  'filter.draft': '下書き',
  'user.logout': 'ログアウト',
  'user.language': '表示言語',

  // ヘッダー
  'bar.viewLive': 'サイトで見る',
  'bar.delete': '削除',
  'bar.unpublish': '下書きに戻す',
  'bar.preview': 'プレビュー',
  'bar.saveDraft': '下書きを保存',
  'bar.publish': '公開',
  'bar.update': '更新',

  // 状態
  'status.new': '新しい記事',
  'status.live': '公開済み',
  'status.draft': '下書き',
  'status.unsaved': '未保存',

  // 空の状態
  'empty.hint': '左から記事を選ぶか、新しく作成してください。',

  // 記事の項目
  'doc.titlePlaceholder': 'タイトル',
  'doc.bodyPlaceholder': '本文を書き始めてください…',
  'doc.date': '日付',
  'doc.coverAdd': 'アイキャッチ画像',
  'doc.coverReplace': '差し替え',
  'doc.coverRemove': '削除',
  'doc.tags': 'タグ',
  'doc.addTag': 'タグを追加',
  'doc.removeTag': 'タグ {tag} を削除',
  'doc.seo': '検索用の説明',
  'doc.descPlaceholder': '検索結果に表示される説明文（60〜110 文字程度）。空のままなら本文の冒頭が使われます。',
  'doc.descAuto': '自動生成',
  'doc.descCount': '{n} 文字',

  // ツールバー
  'toolbar.h2': '見出し',
  'toolbar.bold': '太字（⌘B）',
  'toolbar.italic': '斜体（⌘I）',
  'toolbar.bulletList': '箇条書き',
  'toolbar.orderedList': '番号付きリスト',
  'toolbar.blockquote': '引用',
  'toolbar.link': 'リンク',
  'toolbar.table': '表を挿入',
  'toolbar.html': 'HTML を挿入',
  'html.placeholder': 'ここに書いた HTML はそのままファイルに入ります',
  'toolbar.image': '画像を挿入（複数選ぶと横並びになります）',
  'toolbar.imageLabel': '画像',
  'toolbar.attach': 'ファイルを添付（PDF など、そのままアップロード）',
  'toolbar.attachLabel': 'ファイル',
  'toolbar.undo': '取り消し（⌘Z）',
  'toolbar.redo': 'やり直し（⇧⌘Z）',
  'toolbar.linkPrompt': 'リンク先（空にするとリンクを解除します）',
  'doc.footHint': '画像はそのまま貼り付け／ドロップできます。画像をクリックすると切り抜き・説明・横並びができます。',

  // 表
  'table.row': '行',
  'table.column': '列',
  'table.rowAfter': '下に行を追加',
  'table.rowDelete': 'この行を削除',
  'table.colAfter': '右に列を追加',
  'table.colDelete': 'この列を削除',
  'table.align': 'この列の揃え方（左 / 中央 / 右）',
  'table.delete': '表を削除',

  // ファイル
  'file.attaching': 'ファイルをアップロードしています…',
  'file.tooLarge': 'ファイルが {mb}MB を超えています。',

  // 画像
  'img.crop': '切り抜き/回転',
  'img.caption': '説明',
  'img.side': '横並び',
  'img.replace': '差し替え',
  'img.captionPlaceholder': '画像の説明（画像の下に表示されます）',
  'img.captionSubmit': 'OK',
  'img.layoutAlone': '単独の行に',
  'img.layoutSide': '前の画像と横並び',
  'img.processing': '{n} 枚の画像を処理しています…',
  'img.processingOne': '画像を処理しています…',
  'img.notImage': '画像のみアップロードできます',
  'img.tooLarge': '画像が {mb}MB を超えています',
  'img.compressFailed': '画像の圧縮に失敗しました',
  'img.cropperLoadFailed': '画像編集の部品を読み込めませんでした。通信状況を確認してお試しください。',

  // 切り抜き
  'crop.free': '自由',
  'crop.rotateLeft': '左に回転',
  'crop.rotateRight': '右に回転',
  'crop.reset': '元に戻す',
  'crop.cancel': 'キャンセル',
  'crop.apply': '完了',

  // 入力チェック
  'recover.prompt': 'この記事には {when} の未保存の変更がこのブラウザーに残っています。復元しますか？',
  'recover.promptNew': '{when} に書きかけだった記事が保存されていません。復元しますか？',
  'recover.restored': '復元しました。まだコミットしていません。',
  'theme.auto': 'テーマ：システムに合わせる',
  'theme.light': 'テーマ：ライト',
  'theme.dark': 'テーマ：ダーク',
  'validate.title': 'タイトルを入力してください',
  'validate.body': '本文を入力してください',
  'validate.externalImage': '本文に外部の画像アドレス（他のページから貼り付けたもの）があります。ダウンロードして「画像」ボタンから改めてアップロードしてください。',

  // 保存
  'save.saving': '保存しています…',
  'save.updating': '更新しています…',
  'save.publishing': '公開しています…',
  'save.unpublishing': '下書きに戻しています…',
  'save.deleting': '削除しています…',
  'save.loading': '読み込んでいます…',
  'save.draftSaved': '下書きを保存しました',
  'done.create': '作成しました。1 分ほどでサイトに反映されます。',
  'done.update': '更新しました。1 分ほどでサイトに反映されます。',
  'done.publish': '公開しました。1 分ほどでサイトに反映されます。',
  'done.unpublish': '下書きに戻しました。1 分ほどでサイトに反映されます。',
  'save.deleted': '削除しました',
  'save.busyRepo': '保存できませんでした：リポジトリの更新が立て込んでいます。少し待ってからお試しください。',
  'save.discardConfirm': '保存していない変更があります。破棄してよろしいですか？',
  'save.publishConfirm': '公開するとサイトで誰でも読めるようになります。公開しますか？',
  'save.unpublishConfirm': '下書きに戻すとサイトから見えなくなりますが、内容は下書きとして残ります。戻しますか？',
  'save.deleteConfirm': '下書き「{title}」を完全に削除しますか？',

  // 操作名（コミットメッセージにも使われます）
  'verb.create': '作成',
  'verb.update': '更新',
  'verb.publish': '公開',
  'verb.unpublish': '非公開化',

  // コミットメッセージ
  'commit.article': '記事を{verb}：{title}',
  'commit.delete': '下書きを削除：{title}',

  // 競合
  'conflict.title': 'この記事は他の人が変更しました',
  'conflict.theirsText': 'あなたが開いた後に、別の版が保存されています（タイトル：{title}）。',
  'conflict.deletedText': 'あなたが開いた後に、この記事は削除されました。',
  'conflict.cancel': 'キャンセル',
  'conflict.theirs': '相手の版を読み込む',
  'conflict.mine': '自分の版で上書きする',

  // プレビュー
  'preview.title': 'プレビュー',
  'preview.hint': '公開後の見た目そのまま。未保存の内容も確認できます',
  'preview.desktop': 'パソコン',
  'preview.phone': 'スマートフォン',
  'preview.close': '閉じる',
  'preview.loadFailed': 'プレビュー用の部品を読み込めませんでした。通信状況を確認してお試しください。',

  // デプロイ
  'deploy.pending': 'サイトを更新しています…',
  'deploy.success': 'サイトを更新しました',
  'deploy.failure': 'サイトの更新に失敗しました。管理者にご連絡ください。',

  // 設定 / GitHub
  'config.notAnObject': 'config.json は JSON のオブジェクトである必要があります。',
  'config.required': '{key} がありません。これがないとエディターは動きません。',
  'config.unknown': '{key} はエディターが知らない設定です。',
  'config.unknownDidYouMean': '{key} はエディターが知らない設定です。{guess} のつもりでしたか？',
  'config.mustBe': '{key} は{type}である必要があります。',
  'config.empty': '{key} が空です。',
  'config.oneOf': '{key} は次のいずれかです：{list}。',
  'config.invalid': '{key} の書き方が正しくありません。',
  'config.repoFormat': 'repo は owner/name の形で書きます。',
  'config.absolute': '{key} は http:// または https:// で始まる必要があります。',
  'config.url': '{key} はアドレスである必要があります。完全なアドレスか、/ で始まるもの。',
  'config.slash': '{key} は / で始まる必要があります。',
  'config.range': '{key} は {min} から {max} の間である必要があります。',
  'config.timeZone': '{key}：このブラウザーは {value} というタイムゾーンを知りません。',
  'config.noId': '{key} に {wants} が入っていないので、どの記事も同じページを指すことになります。',
  'config.type.string': 'テキスト',
  'config.type.number': '数値',
  'config.type.boolean': 'true か false',
  'config.type.group': '設定のまとまり',
  'config.badJson': 'config.json が正しい JSON ではありません：{message}',
  'config.heading': 'config.json を直す必要があります',
  'config.where': 'エディターの index.html の隣にあります。config.example.json が書き方の見本です。',
  'config.missing': 'config.json が見つかりません',
  'config.defaultTitle': 'コンテンツ管理',
  'config.defaultCollection': '記事',
  'github.error': 'GitHub：{message}',
  'github.requestFailed': 'GitHub へのリクエストが失敗しました（{status}）',
};
