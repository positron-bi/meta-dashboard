# رفرش و محاسبات

`meta_calculations.py` منطق شاخص‌های مالی مدل را پیاده می‌کند. `refresh_from_sql.py` روی کامپیوتر دارای دسترسی به دیتابیس اجرا می‌شود، فقط دادهٔ ماهانهٔ تجمیعی را می‌خواند و JSON سایت را به‌روز می‌کند.

پیش‌نیازها: Python 3.10+، بستهٔ `pyodbc`، و Microsoft ODBC Driver for SQL Server. آدرس سرور و اعتبارنامه‌ها از متغیرهای محیطی یا فایل محلی `.env.local` خوانده می‌شوند؛ هیچ‌کدام را وارد Git نکنید. اگر استفاده از SQL Server از GitHub-hosted runner مد نظر است، شبکهٔ runner به دیتابیس داخلی دسترسی ندارد؛ از کامپیوتر داخل شبکه یا یک اتصال امن و مجاز استفاده شود.

برای اجرای محاسبات مستقل:

```powershell
python -c "from python.meta_calculations import totals; print(totals([]))"
```
