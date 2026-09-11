using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
class Launcher {
  [STAThread] static void Main(string[] args) {
    string root=AppDomain.CurrentDomain.BaseDirectory;
    string app=Path.Combine(root,"runtime","SoloTRPG.exe");
    if(!File.Exists(app)){MessageBox.Show("请完整解压发布包，保留 runtime 和 library 文件夹。","SoloTRPG");return;}
    try{Process.Start(new ProcessStartInfo(app){WorkingDirectory=root,UseShellExecute=false,Arguments=string.Join(" ",Array.ConvertAll(args,a=>"\""+a.Replace("\"","\\\"")+"\""))});}
    catch(Exception e){MessageBox.Show(e.Message,"SoloTRPG 启动失败");}
  }
}
