using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;

namespace NTiTenderServer
{
    class Program
    {
        static string WorkDir;
        static string BaseDownloadDir;
        static HttpListener Listener;
        static JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };

        static readonly Dictionary<string, string> MimeTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { ".html", "text/html; charset=utf-8" },
            { ".htm",  "text/html; charset=utf-8" },
            { ".js",   "application/javascript; charset=utf-8" },
            { ".css",  "text/css; charset=utf-8" },
            { ".json", "application/json; charset=utf-8" },
            { ".csv",  "text/csv; charset=utf-8" },
            { ".pdf",  "application/pdf" },
            { ".zip",  "application/zip" },
            { ".png",  "image/png" },
            { ".jpg",  "image/jpeg" },
            { ".jpeg", "image/jpeg" },
            { ".svg",  "image/svg+xml" },
            { ".ico",  "image/x-icon" },
            { ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
            { ".xls",  "application/vnd.ms-excel" },
            { ".doc",  "application/msword" },
            { ".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
        };

        static void Main(string[] args)
        {
            try { Console.OutputEncoding = Encoding.UTF8; } catch { }

            ServicePointManager.DefaultConnectionLimit = 100;
            // Enable TLS 1.2 (3072) + TLS 1.1 (768) + TLS 1.0 (192)
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | (SecurityProtocolType)768 | SecurityProtocolType.Tls;
            ServicePointManager.ServerCertificateValidationCallback = delegate { return true; };

            WorkDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
            BaseDownloadDir = Path.Combine(WorkDir, "เอกสารโครงการ_eGP");
            if (!Directory.Exists(BaseDownloadDir))
            {
                try { Directory.CreateDirectory(BaseDownloadDir); } catch { }
            }

            bool openBrowser = true;
            foreach (string arg in args)
            {
                if (arg.Equals("--no-browser", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("--background", StringComparison.OrdinalIgnoreCase))
                {
                    openBrowser = false;
                }
            }

            // Ensure any older NTi_Tender_Server.exe or PowerShell port 8765 listener from another folder is replaced
            // so the running server ALWAYS points to the latest folder location where the user launched it!
            EnsureSingleLatestInstance(openBrowser);

            Listener = new HttpListener();
            Listener.Prefixes.Add("http://127.0.0.1:8765/");
            Listener.Prefixes.Add("http://localhost:8765/");

            try
            {
                Listener.Start();
            }
            catch (Exception ex)
            {
                Console.WriteLine("Cannot start port 8765: " + ex.Message);
                return;
            }

            if (openBrowser)
            {
                OpenUrl("http://127.0.0.1:8765/");
            }

            while (Listener.IsListening)
            {
                try
                {
                    HttpListenerContext ctx = Listener.GetContext();
                    ThreadPool.QueueUserWorkItem(delegate { HandleRequest(ctx); });
                }
                catch
                {
                    if (!Listener.IsListening) break;
                }
            }
        }

        static void EnsureSingleLatestInstance(bool openBrowser)
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:8765/api/status");
                req.Timeout = 1000;
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                using (StreamReader sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                {
                    string jsonStr = sr.ReadToEnd();
                    var statusObj = Json.Deserialize<Dictionary<string, object>>(jsonStr);
                    string runningWorkDir = GetString(statusObj, "workDir").TrimEnd('\\', '/');

                    if (string.Equals(runningWorkDir, WorkDir, StringComparison.OrdinalIgnoreCase))
                    {
                        // Already running from the exact same folder!
                        if (openBrowser)
                        {
                            OpenUrl("http://127.0.0.1:8765/");
                        }
                        Environment.Exit(0);
                    }
                }
            }
            catch
            {
                // Port 8765 not responding, continue starting normally
                return;
            }

            // Another instance is running from an OLD folder (e.g., Downloads before moving to Desktop).
            // Kill other instances of NTi_Tender_Server so this new folder takes over port 8765!
            try
            {
                int currentPid = Process.GetCurrentProcess().Id;
                foreach (Process proc in Process.GetProcessesByName("NTi_Tender_Server"))
                {
                    if (proc.Id != currentPid)
                    {
                        try { proc.Kill(); proc.WaitForExit(1500); } catch { }
                    }
                }
                Thread.Sleep(300);
            }
            catch { }
        }

        static string ResolveTargetBaseDownloadDir(string clientWorkDir)
        {
            // If the browser passed its current folder location (e.g. opened via file:/// after moving the folder),
            // dynamically follow that folder so files ALWAYS land in <CurrentFolder>\เอกสารโครงการ_eGP!
            if (!string.IsNullOrWhiteSpace(clientWorkDir))
            {
                try
                {
                    string cleanDir = clientWorkDir.Trim().TrimEnd('\\', '/');
                    if (Directory.Exists(cleanDir))
                    {
                        WorkDir = cleanDir;
                        BaseDownloadDir = Path.Combine(WorkDir, "เอกสารโครงการ_eGP");
                    }
                }
                catch { }
            }

            if (string.IsNullOrWhiteSpace(BaseDownloadDir) || !Directory.Exists(WorkDir))
            {
                WorkDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
                BaseDownloadDir = Path.Combine(WorkDir, "เอกสารโครงการ_eGP");
            }

            if (!Directory.Exists(BaseDownloadDir))
            {
                try { Directory.CreateDirectory(BaseDownloadDir); } catch { }
            }
            return BaseDownloadDir;
        }

        static void OpenUrl(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                });
            }
            catch { }
        }

        static string GetSafeFolderName(string projName, string projId)
        {
            string raw = string.IsNullOrWhiteSpace(projName) ? "โครงการ_eGP" : projName;
            string clean = Regex.Replace(raw, @"[\\/:*?""<>|\r\n\t]+", " ");
            clean = Regex.Replace(clean, @"\s+", " ").Trim();
            if (clean.Length > 60)
            {
                clean = clean.Substring(0, 60).Trim();
            }
            if (string.IsNullOrEmpty(clean))
            {
                clean = "โครงการ_eGP";
            }
            return clean + "_" + projId;
        }

        static List<Dictionary<string, object>> ExtractZipSafely(string zipPath, string destDir, string prefix, out bool hasAnnouDoc)
        {
            hasAnnouDoc = false;
            var extracted = new List<Dictionary<string, object>>();
            try
            {
                using (ZipArchive archive = ZipFile.OpenRead(zipPath))
                {
                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        if (string.IsNullOrEmpty(entry.Name)) continue;
                        string safeEntryName = Regex.Replace(entry.Name, @"[\\/:*?""<>|]+", "_");
                        if (safeEntryName.IndexOf("annoudoc", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            hasAnnouDoc = true;
                        }
                        string outName = prefix + safeEntryName;
                        string outPath = Path.Combine(destDir, outName);
                        entry.ExtractToFile(outPath, true);
                        extracted.Add(new Dictionary<string, object>
                        {
                            { "name", outName },
                            { "size", entry.Length },
                            { "path", outPath }
                        });
                    }
                }
            }
            catch { }
            return extracted;
        }

        static bool DownloadFileFromEgp(string url, string destPath, int timeoutMs)
        {
            if (string.IsNullOrWhiteSpace(url)) return false;
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
                req.Method = "GET";
                req.Timeout = timeoutMs;
                req.ReadWriteTimeout = timeoutMs;
                req.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                using (Stream inStream = resp.GetResponseStream())
                using (FileStream outStream = new FileStream(destPath, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    byte[] buffer = new byte[65536];
                    int read;
                    while ((read = inStream.Read(buffer, 0, buffer.Length)) > 0)
                    {
                        outStream.Write(buffer, 0, read);
                    }
                }
                FileInfo fi = new FileInfo(destPath);
                return fi.Exists && fi.Length > 0;
            }
            catch
            {
                return false;
            }
        }

        static void HandleRequest(HttpListenerContext ctx)
        {
            HttpListenerRequest req = ctx.Request;
            HttpListenerResponse res = ctx.Response;

            try
            {
                res.Headers.Add("Access-Control-Allow-Origin", "*");
                res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                res.Headers.Add("Access-Control-Allow-Headers", "Content-Type");

                if (req.HttpMethod == "OPTIONS")
                {
                    res.StatusCode = 200;
                    res.Close();
                    return;
                }

                string path = Uri.UnescapeDataString(req.Url.AbsolutePath);

                if (path == "/api/status")
                {
                    string activeBase = ResolveTargetBaseDownloadDir(null);
                    WriteJsonResponse(res, new Dictionary<string, object>
                    {
                        { "ok", true },
                        { "service", "NTi Standalone e-GP Server (.exe)" },
                        { "workDir", WorkDir },
                        { "baseDir", activeBase }
                    });
                    return;
                }

                if (path == "/api/open-folder" && req.HttpMethod == "POST")
                {
                    var payload = ReadJsonBody(req);
                    string clientWorkDir = GetString(payload, "client_work_dir");
                    string activeBase = ResolveTargetBaseDownloadDir(clientWorkDir);
                    string folderPath = GetString(payload, "folderPath");
                    string target = (!string.IsNullOrEmpty(folderPath) && Directory.Exists(folderPath)) ? folderPath : activeBase;
                    try
                    {
                        Process.Start("explorer.exe", "\"" + target + "\"");
                    }
                    catch { }
                    WriteJsonResponse(res, new Dictionary<string, object>
                    {
                        { "ok", true },
                        { "opened", target }
                    });
                    return;
                }

                if (path == "/api/download-project" && req.HttpMethod == "POST")
                {
                    var p = ReadJsonBody(req);
                    string clientWorkDir = GetString(p, "client_work_dir");
                    string activeBaseDir = ResolveTargetBaseDownloadDir(clientWorkDir);

                    string projId = GetString(p, "project_id");
                    string projName = GetString(p, "project_name");
                    string priceZipUrl = GetString(p, "price_zip_url");
                    string torZipUrl = GetString(p, "tor_zip_url");
                    string announcePdfUrl = GetString(p, "announce_pdf_url");
                    string draftZipUrl = GetString(p, "draft_zip_url");
                    bool openFolder = true;
                    if (p != null && p.ContainsKey("open_folder") && p["open_folder"] is bool)
                    {
                        openFolder = (bool)p["open_folder"];
                    }

                    string folderName = GetSafeFolderName(projName, projId);
                    string projDir = Path.Combine(activeBaseDir, folderName);
                    if (!Directory.Exists(projDir))
                    {
                        Directory.CreateDirectory(projDir);
                    }

                    var downloadedFiles = new List<Dictionary<string, object>>();

                    // 1. ประกาศราคากลาง (ZIP)
                    if (!string.IsNullOrEmpty(priceZipUrl))
                    {
                        string priceZipFile = Path.Combine(projDir, "01_ประกาศราคากลาง_" + projId + ".zip");
                        if (DownloadFileFromEgp(priceZipUrl, priceZipFile, 30000))
                        {
                            FileInfo fi = new FileInfo(priceZipFile);
                            downloadedFiles.Add(new Dictionary<string, object>
                            {
                                { "name", fi.Name },
                                { "size", fi.Length },
                                { "type", "ZIP" },
                                { "category", "ประกาศราคากลาง (ไฟล์ต้นฉบับ ZIP)" },
                                { "path", fi.FullName }
                            });
                            bool dummy;
                            var ext1 = ExtractZipSafely(priceZipFile, projDir, "01_ประกาศราคากลาง_", out dummy);
                            foreach (var ef in ext1)
                            {
                                string extType = Path.GetExtension((string)ef["name"]).TrimStart('.').ToUpperInvariant();
                                downloadedFiles.Add(new Dictionary<string, object>
                                {
                                    { "name", ef["name"] },
                                    { "size", ef["size"] },
                                    { "type", string.IsNullOrEmpty(extType) ? "PDF" : extType },
                                    { "category", "ประกาศราคากลาง (แตกไฟล์แล้ว เปิดอ่านได้ทันที)" },
                                    { "path", ef["path"] }
                                });
                            }
                        }
                    }

                    // 2. ร่างเอกสารประกวดราคา(e-Bidding) / เอกสารประกวดราคาและ TOR (ZIP)
                    bool hasExtractedAnnouDoc = false;
                    if (!string.IsNullOrEmpty(torZipUrl))
                    {
                        string torZipFile = Path.Combine(projDir, "02_ร่างเอกสารประกวดราคา_และ_TOR_" + projId + ".zip");
                        if (DownloadFileFromEgp(torZipUrl, torZipFile, 40000))
                        {
                            FileInfo fi = new FileInfo(torZipFile);
                            downloadedFiles.Add(new Dictionary<string, object>
                            {
                                { "name", fi.Name },
                                { "size", fi.Length },
                                { "type", "ZIP" },
                                { "category", "ร่างเอกสารประกวดราคา & TOR (ไฟล์ต้นฉบับ ZIP)" },
                                { "path", fi.FullName }
                            });
                            var ext2 = ExtractZipSafely(torZipFile, projDir, "02_เอกสารประกวดราคา_TOR_", out hasExtractedAnnouDoc);
                            foreach (var ef in ext2)
                            {
                                string extType = Path.GetExtension((string)ef["name"]).TrimStart('.').ToUpperInvariant();
                                downloadedFiles.Add(new Dictionary<string, object>
                                {
                                    { "name", ef["name"] },
                                    { "size", ef["size"] },
                                    { "type", string.IsNullOrEmpty(extType) ? "PDF" : extType },
                                    { "category", "ร่างเอกสารประกวดราคา & TOR (แตกไฟล์แล้ว เปิดอ่านได้ทันที)" },
                                    { "path", ef["path"] }
                                });
                            }
                        }
                    }

                    // 3. ใบประกาศตราครุฑ (PDF) — โหลดเฉพาะกรณีที่ในชุด ZIP ยังไม่มีไฟล์ annoudoc
                    if (!string.IsNullOrEmpty(announcePdfUrl) && !hasExtractedAnnouDoc)
                    {
                        string annPdfFile = Path.Combine(projDir, "03_ประกาศประกวดราคา_ตราครุฑ_" + projId + ".pdf");
                        if (DownloadFileFromEgp(announcePdfUrl, annPdfFile, 30000))
                        {
                            FileInfo fi = new FileInfo(annPdfFile);
                            downloadedFiles.Add(new Dictionary<string, object>
                            {
                                { "name", fi.Name },
                                { "size", fi.Length },
                                { "type", "PDF" },
                                { "category", "ใบประกาศประกวดราคา ตราครุฑ (PDF ทางการ)" },
                                { "path", fi.FullName }
                            });
                        }
                    }

                    // 4. ร่างเอกสาร B0 แยกต่างหาก (ถ้ามี)
                    if (!string.IsNullOrEmpty(draftZipUrl) && draftZipUrl != torZipUrl)
                    {
                        string draftZipFile = Path.Combine(projDir, "04_ร่างเอกสารประกวดราคา_B0_" + projId + ".zip");
                        if (DownloadFileFromEgp(draftZipUrl, draftZipFile, 35000))
                        {
                            FileInfo fi = new FileInfo(draftZipFile);
                            downloadedFiles.Add(new Dictionary<string, object>
                            {
                                { "name", fi.Name },
                                { "size", fi.Length },
                                { "type", "ZIP" },
                                { "category", "ร่างเอกสารประกวดราคา B0 (ZIP)" },
                                { "path", fi.FullName }
                            });
                            bool dummy;
                            var ext4 = ExtractZipSafely(draftZipFile, projDir, "04_ร่างTOR_B0_", out dummy);
                            foreach (var ef in ext4)
                            {
                                string extType = Path.GetExtension((string)ef["name"]).TrimStart('.').ToUpperInvariant();
                                downloadedFiles.Add(new Dictionary<string, object>
                                {
                                    { "name", ef["name"] },
                                    { "size", ef["size"] },
                                    { "type", string.IsNullOrEmpty(extType) ? "PDF" : extType },
                                    { "category", "ร่างเอกสารประกวดราคา B0 (แตกไฟล์แล้ว)" },
                                    { "path", ef["path"] }
                                });
                            }
                        }
                    }

                    if (openFolder)
                    {
                        try
                        {
                            Process.Start("explorer.exe", "\"" + projDir + "\"");
                        }
                        catch { }
                    }

                    WriteJsonResponse(res, new Dictionary<string, object>
                    {
                        { "ok", true },
                        { "projectId", projId },
                        { "folderName", folderName },
                        { "folderPath", projDir },
                        { "workDir", WorkDir },
                        { "relativeFolderPath", "เอกสารโครงการ_eGP\\" + folderName },
                        { "filesCount", downloadedFiles.Count },
                        { "files", downloadedFiles }
                    });
                    return;
                }

                // Serve static files from WorkDir so user can use http://127.0.0.1:8765/ directly anywhere!
                string relPath = path.TrimStart('/');
                if (string.IsNullOrEmpty(relPath)) relPath = "index.html";
                relPath = relPath.Replace('/', Path.DirectorySeparatorChar);

                string fullPath = Path.GetFullPath(Path.Combine(WorkDir, relPath));
                if (fullPath.StartsWith(WorkDir, StringComparison.OrdinalIgnoreCase) && File.Exists(fullPath))
                {
                    string ext = Path.GetExtension(fullPath);
                    string mime;
                    if (!MimeTypes.TryGetValue(ext, out mime))
                    {
                        mime = "application/octet-stream";
                    }
                    res.ContentType = mime;
                    byte[] fileBytes = File.ReadAllBytes(fullPath);
                    res.ContentLength64 = fileBytes.Length;
                    res.OutputStream.Write(fileBytes, 0, fileBytes.Length);
                    res.Close();
                    return;
                }

                res.StatusCode = 404;
                res.Close();
            }
            catch (Exception ex)
            {
                try
                {
                    WriteJsonResponse(res, new Dictionary<string, object>
                    {
                        { "ok", false },
                        { "error", ex.Message }
                    }, 500);
                }
                catch { }
            }
        }

        static Dictionary<string, object> ReadJsonBody(HttpListenerRequest req)
        {
            using (StreamReader reader = new StreamReader(req.InputStream, Encoding.UTF8))
            {
                string body = reader.ReadToEnd();
                if (string.IsNullOrWhiteSpace(body)) return new Dictionary<string, object>();
                return Json.Deserialize<Dictionary<string, object>>(body);
            }
        }

        static string GetString(Dictionary<string, object> dict, string key)
        {
            if (dict != null && dict.ContainsKey(key) && dict[key] != null)
            {
                return dict[key].ToString();
            }
            return "";
        }

        static void WriteJsonResponse(HttpListenerResponse res, object data, int statusCode = 200)
        {
            string json = Json.Serialize(data);
            byte[] bytes = Encoding.UTF8.GetBytes(json);
            res.StatusCode = statusCode;
            res.ContentType = "application/json; charset=utf-8";
            res.ContentLength64 = bytes.Length;
            res.OutputStream.Write(bytes, 0, bytes.Length);
            res.Close();
        }
    }
}
