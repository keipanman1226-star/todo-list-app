/* ==========================================================
   サービスワーカー（sw.js）
   --------------------------------------------------------
   オフラインでもアプリを開けるようにするための仕組み。
   「ネットワーク優先」方式を採用している:
     1. まずネットワーク（最新のファイル）から取得を試みる
     2. 取得できたらキャッシュに保存しておく
     3. オフラインなどでネットワークに失敗したときだけ、
        キャッシュに保存しておいた古いファイルを返す
   これにより、ファイルを更新したときにスマホ側が古い表示の
   ままになってしまう問題を防いでいる。
   ========================================================== */

// キャッシュの名前。ファイルの中身を変更したときはこの番号を上げると、
// 古いキャッシュが破棄されて新しいキャッシュが作られる
const CACHE_NAME = "todo-list-cache-v1";

// オフライン時の最低限の表示に必要なファイル一覧
const CORE_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
];

// インストール時に、最低限必要なファイルを先にキャッシュしておく
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_FILES))
  );
  self.skipWaiting();
});

// 古いバージョンのキャッシュを掃除する
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// 通信のたびに「ネットワーク優先、失敗したらキャッシュ」で応答する
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
