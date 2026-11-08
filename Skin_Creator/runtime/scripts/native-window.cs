using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class CodexCreatorNativeWindows {
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int x,y; }
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int left,top,right,bottom; }
 [StructLayout(LayoutKind.Sequential)] public struct PLACEMENT {
  public uint length,flags,showCmd; public POINT min,max; public RECT normal;
 }
 public delegate bool EnumCallback(IntPtr hwnd, IntPtr data);
 [DllImport("user32.dll",SetLastError=true)] public static extern bool EnumWindows(EnumCallback callback,IntPtr data);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hwnd,uint command);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint processId);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern IntPtr GetWindowDpiAwarenessContext(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll",SetLastError=true)] public static extern bool GetWindowPlacement(IntPtr hwnd,ref PLACEMENT placement);
 [DllImport("user32.dll",SetLastError=true)] public static extern bool SetWindowPlacement(IntPtr hwnd,ref PLACEMENT placement);
 public static bool Belongs(IntPtr hwnd,uint owner) {
  uint actual; return IsWindow(hwnd) && GetWindowThreadProcessId(hwnd,out actual)!=0 && actual==owner;
 }
 public static IntPtr[] Windows(uint owner) {
  var result=new List<IntPtr>();
  EnumCallback visit=(hwnd,data)=>{if(Belongs(hwnd,owner)&&IsWindowVisible(hwnd)&&IsWindowEnabled(hwnd)&&GetWindow(hwnd,4)==IntPtr.Zero)result.Add(hwnd);return true;};
  if(!EnumWindows(visit,IntPtr.Zero))throw new InvalidOperationException("EnumWindows failed");
  return result.ToArray();
 }
 public static PLACEMENT Read(IntPtr hwnd,uint owner) {
  if(!Belongs(hwnd,owner))throw new InvalidOperationException("Native window owner changed");
  var context=GetWindowDpiAwarenessContext(hwnd);
  var previous=context==IntPtr.Zero?IntPtr.Zero:SetThreadDpiAwarenessContext(context);
  if(previous==IntPtr.Zero)throw new InvalidOperationException("Cannot bind the window DPI context");
  try {
   var placement=new PLACEMENT();placement.length=(uint)Marshal.SizeOf(typeof(PLACEMENT));
   if(!GetWindowPlacement(hwnd,ref placement))throw new InvalidOperationException("GetWindowPlacement failed");
   return placement;
  } finally {if(SetThreadDpiAwarenessContext(previous)==IntPtr.Zero)throw new InvalidOperationException("Cannot restore the helper DPI context");}
 }
 public static void Apply(IntPtr hwnd,uint owner,PLACEMENT placement) {
  var context=GetWindowDpiAwarenessContext(hwnd);
  var previous=context==IntPtr.Zero?IntPtr.Zero:SetThreadDpiAwarenessContext(context);
  if(previous==IntPtr.Zero)throw new InvalidOperationException("Cannot bind the window DPI context");
  try {
   if(!Belongs(hwnd,owner))throw new InvalidOperationException("Native window owner changed");
   placement.length=(uint)Marshal.SizeOf(typeof(PLACEMENT));
   if(!SetWindowPlacement(hwnd,ref placement))throw new InvalidOperationException("SetWindowPlacement failed");
  } finally {if(SetThreadDpiAwarenessContext(previous)==IntPtr.Zero)throw new InvalidOperationException("Cannot restore the helper DPI context");}
 }
}
