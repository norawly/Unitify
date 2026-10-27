# Unitify Bridge: подготовка к Chrome Web Store

## Передача другому человеку без новой публикации

Обновлено 27 октября 2026 года: Нурали разрешил получателю проекта использовать
существующее расширение. Создавать новый item и заново проходить публикацию
в Google для личного экземпляра не требуется. Основной маршрут — собственный
Cloudflare и ZIP того же расширения с новым backend, установленный распакованным.
См. [полную инструкцию](self-hosting.md) и [готовый промпт](agent-handoff.md).

Эта страница описывает подготовку/сопровождение магазинного item владельцем,
а не обязательный шаг получателя. Наличие ZIP и этой инструкции не подтверждает
текущий статус публикации или одобрения Google.

В существующей версии сервер фиксирован: неизменённая магазинная копия
не переключается на новый Cloudflare. Для неё потребуется обновление того же
item с поддержкой другого адреса; для распакованной копии достаточно изменить
адреса и пересобрать пакет. Права владельца магазина получателю не передаются.

## Что уже готово

- MV3-пакет: `public/downloads/unitify-moodle-reader.zip` после `npm run build`. В корне ZIP находится manifest.json, а не внешняя папка.
- HTTPS API исходного экземпляра: https://s.zhengisbay.com/api/lms/. Публикация в Chrome Web Store сама по себе его не меняет. Доступность проверяется отдельно; в независимой копии используется собственный origin. Авторизация выполняется ключом устройства, а не секретностью URL.
- Мини-меню, пауза, одноразовый код привязки, изоляция Moodle-аккаунтов, ограничение запросов и автоматический суточный/дневной график чтения.
- Расширению из магазина не нужен заранее записанный персональный ключ. Сервер принимает origin установленного Chrome-расширения, но выдаёт доступ только после действительного одноразового кода разрешённого Telegram-аккаунта. Смена ID при переходе с распакованной версии на магазинную не требует менять API. Новую магазинную установку нужно привязать заново.
- Публичная политика: https://s.zhengisbay.com/bridge-privacy.html.
- В коде нет cookies, паролей, Telegram bot token или общих ключей доступа. Внешний исполняемый код не загружается. Единственный web-accessible resource — локальный модуль форматирования карточек, доступный только LMS; персональных данных в нём нет.

## Как подключается приглашённый пользователь

1. Установить расширение из магазина.
2. В разрешённом Telegram-аккаунте открыть бота и вызвать `/extension`.
3. Ввести полученный одноразовый код в Unitify Bridge. Код действует 10 минут и используется один раз.
4. Войти в свой Moodle обычным способом. После привязки расширение читает разрешённые страницы в той же браузерной сессии.
5. Бот показывает сохранённые данные даже при закрытом ноутбуке. Новых данных без браузера и открытой сессии Moodle не будет.

Исходный сервер разрешает привязку расширения только двум владельцам: Нурали и Нурбеку. Отдельный read-only демодоступ не даёт права привязки. Другим установка расширения НЕ даёт доступ к боту. Для самостоятельного аккаунта нужен свой сервер с адаптацией доступа по инструкции переноса; для публичного сервиса — отдельное решение о регистрации и квотах.

## Что владелец должен сделать в Google

1. Зарегистрировать аккаунт разработчика и самостоятельно принять соглашения/оплатить разовый регистрационный сбор. Эти действия здесь не выполнялись.
2. В Chrome Developer Dashboard создать новый item и загрузить ZIP.
3. Заполнить Store Listing, Privacy, Distribution и Test instructions. Начать лучше с Unlisted (доступ по ссылке): это видимость в магазине, НЕ защита бота.
4. Добавить настоящие скриншоты мини-меню/привязки без личных кодов и оценок. Если показывается синтетическая карточка, явно пометить DEMO, не выдавать её за реальные результаты пользователя.
5. Перед отправкой на модерацию согласовать отдельный тестовый доступ, доступный проверяющему. Производственные аккаунты двух владельцев и их учебные логины не передавать. Сейчас такого проверочного доступа нет: пакет подготовлен, но полная готовность к модерации не заявляется. Видео само по себе не гарантирует одобрения.
6. После одобрения новые версии загружать как обновления ТОГО ЖЕ item с увеличением версии manifest.json. Установленные из магазина копии будут обновляться штатным механизмом Chrome, не заменой кода с Cloudflare.

## Текст для Store Listing (проверить перед отправкой)

**Name:** Unitify Bridge

**Summary:** Read-only Moodle sync for invited Unitify Telegram users: homework, grades and attendance.

**Description:** Unitify Bridge connects your existing Astana IT University Moodle session to your private Unitify Telegram account. Pair using a one-time code from the bot. The extension reads assignment deadlines and submission status, grade reports and attendance records. Your saved snapshot remains available in Telegram when your computer is offline. You can pause synchronization at any time. This is an independent, invite-only project, not an official university extension. Installing the extension does not create access to the private bot. A permitted Telegram account and a university Moodle account are required. Cookies, passwords and source HTML are not uploaded. Assignment submission, exams and attendance marking are not automated.

## Privacy: какие данные реально используются

Указать обработку личных/учебных данных и Moodle user ID, а не отмечать «данные не собираются». Через расширение проходят задания, сроки, статусы сдачи, оценки, комментарии преподавателей и attendance. Для доставки бот обрабатывает Telegram chat ID; изображения оценок передаются в Telegram по запросу. Конкретные checkbox-категории выбрать по актуальным определениям панели Google, сверив их с политикой.

**Single purpose:** Read-only synchronization of the user's own Moodle academic records with their paired private Unitify Telegram account.

**storage:** Stores pause state, the device pairing credential, timestamps, cached activity links and the user's academic snapshot locally.

**alarms:** Checks whether the safe synchronization interval has elapsed; does not contact Moodle when no Moodle tab is open.

**lms.astanait.edu.kz host access:** Reads the signed-in student's own course, assignment, user-grade and attendance pages with same-session GET requests, only after Telegram pairing. No cookie permission, password collection, separate sign-in or write operations.

**s.zhengisbay.com host access:** Exchanges one-time pairing codes, syncs private normalized academic records and grade-card images with the HTTPS backend, and fetches data-only scheduling policy and version information. No remotely hosted executable code.

## Источники

- https://developer.chrome.com/docs/webstore/register
- https://developer.chrome.com/docs/webstore/publish
- https://developer.chrome.com/docs/webstore/cws-dashboard-distribution
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code
