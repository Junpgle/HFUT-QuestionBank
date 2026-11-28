-- Anonymous page-load receipts provide retry-safe PV counts without storing IPs or account IDs.
CREATE TABLE IF NOT EXISTS SitePageViews (
  visit_id TEXT PRIMARY KEY NOT NULL,
  day TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS SiteDailyMetrics (
  day TEXT PRIMARY KEY NOT NULL,
  page_views INTEGER NOT NULL DEFAULT 0
);
CREATE TRIGGER IF NOT EXISTS qbank_count_page_view AFTER INSERT ON SitePageViews
BEGIN
  INSERT INTO SiteDailyMetrics(day,page_views) VALUES(NEW.day,1)
  ON CONFLICT(day) DO UPDATE SET page_views=page_views+1;
END;
